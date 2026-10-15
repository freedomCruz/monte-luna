// Package domain owns fiscal calculation rules, independent of transport and storage.
package domain

import "errors"

type Profile struct {
	Country        string  `json:"country"`
	LegalForm      string  `json:"legal_form"`
	TaxRegime      *string `json:"tax_regime"`
	VATResponsible bool    `json:"vat_responsible"`
}
type Line struct {
	Category   string
	BaseAmount int64
}
type LineTax struct {
	Category, Code string
	BaseAmount     int64
	RateBPS        int32
	Amount         int64
}
type Result struct {
	Lines       []LineTax
	TotalAmount int64
	Profile     Profile
}

// Calculate supports only approved Scenario A. No statutory rate, UVT value or
// threshold is embedded here. VAT-responsible pricing remains an explicit future
// policy requiring dated data, rather than silently applying zero VAT.
func Calculate(profile Profile, lines []Line) (Result, error) {
	if profile.Country != "CO" || profile.VATResponsible {
		return Result{}, errors.New("tax policy unavailable for merchant profile")
	}
	if profile.TaxRegime != nil {
		regime := *profile.TaxRegime
		profile.TaxRegime = &regime
	}
	result := Result{Profile: profile, Lines: make([]LineTax, 0, len(lines))}
	for _, line := range lines {
		switch line.Category {
		case "excluded", "exempt", "reduced", "standard":
		default:
			return Result{}, errors.New("unknown tax category")
		}
		if line.BaseAmount < 0 {
			return Result{}, errors.New("negative taxable base")
		}
		result.Lines = append(result.Lines, LineTax{Category: "excluded", Code: "excluded", BaseAmount: line.BaseAmount})
	}
	return result, nil
}
