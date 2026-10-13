package contracttest_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
)

// TestEveryContractIsValid loads every document in contracts/openapi so an
// invalid contract fails the backend build before any handler uses it.
func TestEveryContractIsValid(t *testing.T) {
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "..", "..", "..", "contracts", "openapi")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	found := 0
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".yaml") {
			continue
		}
		found++
		t.Run(e.Name(), func(t *testing.T) {
			contracttest.Load(t, e.Name())
		})
	}
	if found == 0 {
		t.Fatal("no contracts found")
	}
}
