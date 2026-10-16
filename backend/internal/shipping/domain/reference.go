package domain

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

// DIVIPOLA is adapted DANE data under CC BY-SA 4.0. Attribution, source,
// transformation notice and license URL are retained in the embedded snapshot;
// see contracts/reference/README.md for the regeneration procedure.
//
//go:embed divipola.json
var referenceJSON []byte

type Municipality struct {
	Code             string
	DepartmentCode   string
	DepartmentName   string
	MunicipalityName string
	Type             string
}

// Reference owns an immutable lookup snapshot; callers receive value copies.
type Reference struct {
	departments    map[string]string
	municipalities map[string]Municipality
}

func NewReference() *Reference {
	var snapshot struct {
		Departments []struct {
			Code        string `json:"code"`
			DisplayName string `json:"display_name"`
		} `json:"departments"`
		Municipalities []struct {
			Code           string `json:"code"`
			DepartmentCode string `json:"department_code"`
			DisplayName    string `json:"display_name"`
			Type           string `json:"type"`
		} `json:"municipalities"`
	}
	// Malformed compiled-in data is a build artifact defect, not runtime input.
	if err := json.Unmarshal(referenceJSON, &snapshot); err != nil {
		panic(fmt.Sprintf("invalid embedded DIVIPOLA snapshot: %v", err))
	}
	ref := &Reference{departments: make(map[string]string), municipalities: make(map[string]Municipality)}
	for _, department := range snapshot.Departments {
		ref.departments[department.Code] = department.DisplayName
	}
	for _, municipality := range snapshot.Municipalities {
		ref.municipalities[municipality.Code] = Municipality{Code: municipality.Code, DepartmentCode: municipality.DepartmentCode, DepartmentName: ref.departments[municipality.DepartmentCode], MunicipalityName: municipality.DisplayName, Type: municipality.Type}
	}
	return ref
}
func (r *Reference) Lookup(code string) (Municipality, error) {
	municipality, ok := r.municipalities[code]
	if !ok {
		return Municipality{}, &UnknownMunicipalityError{Code: code}
	}
	return municipality, nil
}
func (r *Reference) ValidateArea(department string, municipality *string) error {
	if _, ok := r.departments[department]; !ok {
		return fmt.Errorf("unknown department %q", department)
	}
	if municipality == nil {
		return nil
	}
	place, err := r.Lookup(*municipality)
	if err != nil {
		return err
	}
	if place.DepartmentCode != department {
		return fmt.Errorf("municipality %q does not belong to department %q", *municipality, department)
	}
	return nil
}
