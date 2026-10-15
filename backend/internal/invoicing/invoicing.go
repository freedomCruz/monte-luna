// Package invoicing exposes the synchronous tax calculation port only.
// Fiscal issuance and VAT-responsible merchant policies are not implemented.
package invoicing

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/freedomCruz/monte-luna/backend/internal/invoicing/domain"
)

type Profile = domain.Profile
type Line = domain.Line
type LineTax = domain.LineTax
type TaxResult = domain.Result
type TaxRequest struct {
	Lines            []Line
	MunicipalityCode string
}
type TaxCalculator interface {
	Calculate(context.Context, TaxRequest) (TaxResult, error)
}
type Calculator struct{ profile Profile }

//go:embed demo-profile.json
var demoProfile string

// NewDemo loads the explicitly approved Scenario A configuration, not a fiscal
// classification inferred from sales or product categories.
func NewDemo() (*Calculator, error) {
	var profile Profile
	if err := json.Unmarshal([]byte(demoProfile), &profile); err != nil {
		return nil, fmt.Errorf("decode demo fiscal profile: %w", err)
	}
	return New(profile)
}
func New(profile Profile) (*Calculator, error) {
	snapshot, err := domain.Calculate(profile, nil)
	if err != nil {
		return nil, err
	}
	return &Calculator{profile: snapshot.Profile}, nil
}
func (c *Calculator) Calculate(ctx context.Context, request TaxRequest) (TaxResult, error) {
	if err := ctx.Err(); err != nil {
		return TaxResult{}, err
	}
	return domain.Calculate(c.profile, request.Lines)
}
