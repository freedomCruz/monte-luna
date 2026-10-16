package adapters

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"
)

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

type RandomOrderNumbers struct{}

func (RandomOrderNumbers) OrderNumber() (string, error) {
	var bytes [5]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	var value uint64
	for _, b := range bytes {
		value = value<<8 | uint64(b)
	}
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	result := []byte("ORD-00000000")
	for i := range 8 {
		result[4+i] = alphabet[(value>>uint(5*(7-i)))&31]
	}
	return string(result), nil
}
func DecodeTrackingSecret(encoded string) ([]byte, error) {
	if encoded == "" {
		return nil, errors.New("TRACKING_TOKEN_SECRET is required")
	}
	secret, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(secret) < 32 {
		return nil, errors.New("TRACKING_TOKEN_SECRET must be base64 encoding at least 32 bytes")
	}
	return secret, nil
}
