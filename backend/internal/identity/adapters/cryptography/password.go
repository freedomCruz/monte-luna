// Package cryptography implements identity password hashing and secret encryption.
package cryptography

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Hasher uses the approved OWASP minimum and an injectable entropy source.
// The default source is crypto/rand.Reader; custom readers must be safe for the
// caller's concurrency model. Hashing never includes a password in an error.
type Hasher struct{ random io.Reader }

func NewHasher(random io.Reader) *Hasher {
	if random == nil {
		random = rand.Reader
	}
	return &Hasher{random: random}
}
func (h *Hasher) Hash(password string) (string, error) {
	if password == "" {
		return "", errors.New("password is required")
	}
	salt := make([]byte, 16)
	if _, err := io.ReadFull(h.random, salt); err != nil {
		return "", errors.New("password salt unavailable")
	}
	key := argon2.IDKey([]byte(password), salt, 2, 19456, 1, 32)
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// Verify returns needsRehash for legacy parameters below the current minimum.
// Work factors are bounded before allocation, even for corrupt stored PHCs.
func (h *Hasher) Verify(password, phc string) (matches, needsRehash bool, err error) {
	parts := strings.Split(phc, "$")
	invalid := errors.New("invalid password hash")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return false, false, invalid
	}
	params := strings.Split(parts[3], ",")
	if len(params) != 3 {
		return false, false, invalid
	}
	values := make([]uint64, 3)
	for i, prefix := range []string{"m=", "t=", "p="} {
		if !strings.HasPrefix(params[i], prefix) {
			return false, false, invalid
		}
		n, e := strconv.ParseUint(strings.TrimPrefix(params[i], prefix), 10, 32)
		if e != nil {
			return false, false, invalid
		}
		values[i] = n
	}
	m, iterations, parallelism := values[0], values[1], values[2]
	if parallelism < 1 || parallelism > 16 || m < 8*parallelism || m > 262144 || iterations < 1 || iterations > 10 {
		return false, false, invalid
	}
	salt, e := base64.RawStdEncoding.Strict().DecodeString(parts[4])
	if e != nil || len(salt) < 16 || len(salt) > 64 {
		return false, false, invalid
	}
	expected, e := base64.RawStdEncoding.Strict().DecodeString(parts[5])
	if e != nil || len(expected) != 32 {
		return false, false, invalid
	}
	actual := argon2.IDKey([]byte(password), salt, uint32(iterations), uint32(m), uint8(parallelism), 32)
	matches = subtle.ConstantTimeCompare(actual, expected) == 1
	return matches, matches && (m < 19456 || iterations < 2), nil
}
