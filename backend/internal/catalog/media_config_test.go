package catalog_test

import (
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog"
)

func TestMediaConfiguration(t *testing.T) {
	values := map[string]string{"MEDIA_STORAGE": "r2", "R2_ENDPOINT": "https://account.r2.cloudflarestorage.com", "R2_BUCKET": "development-media", "R2_ACCESS_KEY_ID": "test-access", "R2_SECRET_ACCESS_KEY": "test-secret"}
	get := func(key string) string { return values[key] }
	cfg, err := catalog.LoadMediaConfig(get)
	if err != nil || cfg.Storage != "r2" {
		t.Fatalf("%+v %v", cfg, err)
	}
	for _, key := range []string{"R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"} {
		saved := values[key]
		values[key] = ""
		if _, err := catalog.LoadMediaConfig(get); err == nil || !strings.Contains(err.Error(), key) || strings.Contains(err.Error(), "test-secret") {
			t.Fatalf("missing %s error: %v", key, err)
		}
		values[key] = saved
	}
	values["R2_ENDPOINT"] = "https://user:secret@account.r2.cloudflarestorage.com/path?secret=x"
	if _, err := catalog.LoadMediaConfig(get); err == nil || strings.Contains(err.Error(), "user:") {
		t.Fatal("invalid endpoint or credential leak")
	}
	values["MEDIA_STORAGE"] = ""
	cfg, err = catalog.LoadMediaConfig(get)
	if err != nil || cfg.Storage != "disabled" || cfg.SecretAccessKey != "" {
		t.Fatal("default disabled must not require or load credentials")
	}
	values["MEDIA_STORAGE"] = "other"
	if _, err := catalog.LoadMediaConfig(get); err == nil || !strings.Contains(err.Error(), "MEDIA_STORAGE") {
		t.Fatal("unknown mode accepted")
	}
}
