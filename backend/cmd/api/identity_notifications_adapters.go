package main

import (
	"context"
	"errors"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications"
)

// identityTokenDecryptor satisfies notifications.TokenDecryptor using only
// Identity's public OneTimeLinks facade (ForAdmin(adminUserID).Decrypt).
type identityTokenDecryptor struct {
	links *identity.OneTimeLinks
}

func newIdentityTokenDecryptor(links *identity.OneTimeLinks) (notifications.TokenDecryptor, error) {
	if links == nil {
		return nil, errors.New("identity links facade is required")
	}
	return &identityTokenDecryptor{links: links}, nil
}

func (d *identityTokenDecryptor) Decrypt(ctx context.Context, adminUserID, encrypted string) (string, error) {
	return d.links.ForAdmin(adminUserID).Decrypt(ctx, encrypted)
}

// identityLinkBuilder satisfies notifications.LinkBuilder using only
// Identity's public OneTimeLinks facade.
type identityLinkBuilder struct {
	links *identity.OneTimeLinks
}

func newIdentityLinkBuilder(links *identity.OneTimeLinks) (notifications.LinkBuilder, error) {
	if links == nil {
		return nil, errors.New("identity links facade is required")
	}
	return &identityLinkBuilder{links: links}, nil
}

func (b *identityLinkBuilder) Build(ctx context.Context, eventType, token string) (string, error) {
	return b.links.Build(ctx, eventType, token)
}
