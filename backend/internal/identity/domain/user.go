// Package domain contains administrator identity invariants and persistence ports.
package domain

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"
)

type Role string
type Status string

const (
	Owner    Role   = "owner"
	Staff    Role   = "staff"
	Active   Status = "active"
	Disabled Status = "disabled"
)

var (
	ErrValidation      = errors.New("invalid administrator")
	ErrLastActiveOwner = errors.New("last active owner cannot be disabled or demoted")
	ErrNotFound        = errors.New("administrator not found")
	ErrVersionConflict = errors.New("administrator version conflict")
	ErrEmailConflict   = errors.New("administrator email already exists")
)

type User struct {
	ID                  string
	Email               string
	DisplayName         string
	Role                Role
	Status              Status
	PasswordHash        string `json:"-"`
	PasswordChangedAt   time.Time
	SessionVersion      int32      `json:"-"`
	FailedLoginAttempts int32      `json:"-"`
	LockedUntil         *time.Time `json:"-"`
	LastLoginAt         *time.Time
	Version             int32
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type UserChanges struct {
	Email       *string
	DisplayName *string
	Role        *Role
	Status      *Status
}

func NewUser(email, name string, role Role, status Status) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || strings.TrimSpace(name) == "" ||
		(role != Owner && role != Staff) || (status != Active && status != Disabled) {
		return User{}, ErrValidation
	}
	return User{Email: email, DisplayName: name, Role: role, Status: status, Version: 1, SessionVersion: 1}, nil
}

// Apply is pure. The repository must count and update owners under one shared
// transaction lock, otherwise concurrent demotions could defeat this invariant.
func (u User) Apply(change UserChanges, activeOwners int) (User, error) {
	next := u
	if change.Email != nil {
		next.Email = *change.Email
	}
	if change.DisplayName != nil {
		next.DisplayName = *change.DisplayName
	}
	if change.Role != nil {
		next.Role = *change.Role
	}
	if change.Status != nil {
		next.Status = *change.Status
	}
	validated, err := NewUser(next.Email, next.DisplayName, next.Role, next.Status)
	if err != nil {
		return User{}, err
	}
	next.Email = validated.Email
	if u.Role == Owner && u.Status == Active && (next.Role != Owner || next.Status != Active) && activeOwners <= 1 {
		return User{}, ErrLastActiveOwner
	}
	if next.Role != u.Role || (next.Status != u.Status && next.Status == Disabled) {
		next.SessionVersion++
	}
	next.Version++
	return next, nil
}

// UserRepository accepts only prehashed passwords; invitation/bootstrap use
// cases supply them. It does not authenticate callers or expose HTTP endpoints.
type UserRepository interface {
	Create(context.Context, User) (User, error)
	Get(context.Context, string) (User, error)
	FindByEmail(context.Context, string) (User, error)
	List(context.Context, string, int) ([]User, error)
	Update(context.Context, string, int32, UserChanges) (User, error)
}
