package catalog

import (
	"fmt"
	"net/url"
	"strings"
)

// MediaConfig holds operator-only R2 settings; never log or JSON-encode it.
// The disabled default preserves storefront reads without provider credentials.
type MediaConfig struct {
	Storage                                        string
	Endpoint, Bucket, AccessKeyID, SecretAccessKey string
}

func LoadMediaConfig(getenv func(string) string) (MediaConfig, error) {
	cfg := MediaConfig{Storage: getenv("MEDIA_STORAGE")}
	if cfg.Storage == "" {
		cfg.Storage = "disabled"
	}
	if cfg.Storage == "disabled" {
		return cfg, nil
	}
	if cfg.Storage != "r2" {
		return MediaConfig{}, fmt.Errorf("MEDIA_STORAGE must be disabled or r2")
	}
	cfg.Endpoint = getenv("R2_ENDPOINT")
	cfg.Bucket = getenv("R2_BUCKET")
	cfg.AccessKeyID = getenv("R2_ACCESS_KEY_ID")
	cfg.SecretAccessKey = getenv("R2_SECRET_ACCESS_KEY")
	return cfg, cfg.Validate()
}
func (c MediaConfig) Validate() error {
	if c.Storage == "" || c.Storage == "disabled" {
		return nil
	}
	if c.Storage != "r2" {
		return fmt.Errorf("MEDIA_STORAGE must be disabled or r2")
	}
	for _, entry := range []struct{ name, value string }{{"R2_ENDPOINT", c.Endpoint}, {"R2_BUCKET", c.Bucket}, {"R2_ACCESS_KEY_ID", c.AccessKeyID}, {"R2_SECRET_ACCESS_KEY", c.SecretAccessKey}} {
		if strings.TrimSpace(entry.value) == "" {
			return fmt.Errorf("%s is required when MEDIA_STORAGE is r2", entry.name)
		}
	}
	endpoint, err := url.Parse(c.Endpoint)
	if err != nil || endpoint.Scheme != "https" || !strings.HasSuffix(endpoint.Hostname(), ".r2.cloudflarestorage.com") || endpoint.Port() != "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || endpoint.Path != "" && endpoint.Path != "/" {
		return fmt.Errorf("R2_ENDPOINT must be an HTTPS R2 account endpoint without credentials, port, path, query or fragment")
	}
	if strings.ContainsAny(c.Bucket, "/\\?# \t\r\n") {
		return fmt.Errorf("R2_BUCKET must be a bucket name")
	}
	if strings.ContainsAny(c.AccessKeyID, " \t\r\n") {
		return fmt.Errorf("R2_ACCESS_KEY_ID must not contain whitespace")
	}
	if strings.ContainsAny(c.SecretAccessKey, " \t\r\n") {
		return fmt.Errorf("R2_SECRET_ACCESS_KEY must not contain whitespace")
	}
	return nil
}
