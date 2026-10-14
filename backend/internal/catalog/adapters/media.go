// Package adapters provides catalog HTTP and public-media implementations.
package adapters

import (
	"context"
	"errors"
	"net/url"
	"strings"
)

type Media struct{ base string }

func NewMedia(base string) (*Media, error) {
	if strings.TrimSpace(base) == "" {
		return nil, errors.New("MEDIA_BASE_URL is required")
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Opaque != "" {
		return nil, errors.New("MEDIA_BASE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment")
	}
	return &Media{base: strings.TrimRight(parsed.String(), "/")}, nil
}
func (m *Media) Resolve(_ context.Context, key string) (string, error) {
	if key == "" || strings.HasPrefix(key, "/") || strings.ContainsAny(key, "\\:?#\r\n\x00") {
		return "", errors.New("media storage key must be relative")
	}
	for _, part := range strings.Split(key, "/") {
		if part == "." || part == ".." || part == "" {
			return "", errors.New("media storage key must not contain traversal or empty segments")
		}
	}
	result, err := url.JoinPath(m.base, key)
	if err != nil {
		return "", errors.New("invalid media storage key")
	}
	return result, nil
}
