package cryptography

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"io"
)

type Cipher struct {
	aead   cipher.AEAD
	random io.Reader
}

// NewCipher requires a decoded AES-256 key. Startup configuration owns parsing
// the environment; this primitive never reads environment variables itself.
func NewCipher(key []byte, random io.Reader) (*Cipher, error) {
	if len(key) != 32 {
		return nil, errors.New("encryption key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, errors.New("invalid encryption key")
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if random == nil {
		random = rand.Reader
	}
	return &Cipher{aead: aead, random: random}, nil
}

// Seal prefixes a random nonce to authenticated ciphertext. Purpose binds the
// ciphertext to its use (for example totp or reset-outbox) as authenticated data.
func (c *Cipher) Seal(plaintext []byte, purpose string) ([]byte, error) {
	if purpose == "" {
		return nil, errors.New("encryption purpose required")
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(c.random, nonce); err != nil {
		return nil, errors.New("encryption nonce unavailable")
	}
	return c.aead.Seal(nonce, nonce, plaintext, []byte(purpose)), nil
}
func (c *Cipher) Open(encrypted []byte, purpose string) ([]byte, error) {
	if purpose == "" || len(encrypted) < c.aead.NonceSize()+c.aead.Overhead() {
		return nil, errors.New("invalid encrypted secret")
	}
	size := c.aead.NonceSize()
	plaintext, err := c.aead.Open(nil, encrypted[:size], encrypted[size:], []byte(purpose))
	if err != nil {
		return nil, errors.New("invalid encrypted secret")
	}
	return plaintext, nil
}
