package domain

import (
	"bytes"
	"os"
	"testing"
)

func TestEmbeddedReferenceMatchesCanonical(t *testing.T) {
	canonical, err := os.ReadFile("../../../../contracts/reference/divipola.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(referenceJSON, canonical) {
		t.Fatal("embedded DIVIPOLA differs from contracts/reference/divipola.json; update both copies")
	}
	ref := NewReference()
	if len(ref.departments) != 33 || len(ref.municipalities) != 1122 {
		t.Fatalf("reference counts = %d departments/%d municipalities", len(ref.departments), len(ref.municipalities))
	}
	for code, place := range ref.municipalities {
		if place.DepartmentName == "" || place.MunicipalityName == "" {
			t.Fatalf("missing display name: %s", code)
		}
		if err := ref.ValidateArea(place.DepartmentCode, &code); err != nil {
			t.Fatal(err)
		}
	}
}
