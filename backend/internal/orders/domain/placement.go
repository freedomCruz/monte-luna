package domain

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type Customer struct {
	Email    string  `json:"email"`
	FullName string  `json:"full_name"`
	Phone    *string `json:"phone"`
}
type Address struct {
	RecipientName    string  `json:"recipient_name"`
	RecipientPhone   string  `json:"recipient_phone"`
	MunicipalityCode string  `json:"municipality_code"`
	AddressLine1     string  `json:"address_line1"`
	AddressLine2     *string `json:"address_line2"`
	PostalCode       *string `json:"postal_code"`
	DeliveryNotes    *string `json:"delivery_notes"`
	DepartmentName   string  `json:"-"`
	MunicipalityName string  `json:"-"`
}
type FiscalData struct {
	PersonType     string `json:"person_type"`
	DocumentType   string `json:"document_type"`
	DocumentNumber string `json:"document_number"`
}
type PlaceRequest struct {
	Items             []Item      `json:"items"`
	Customer          Customer    `json:"customer"`
	Address           Address     `json:"shipping_address"`
	Fiscal            *FiscalData `json:"fiscal_data"`
	AcceptsDataPolicy bool        `json:"accepts_data_policy"`
}

func NormalizeKey(key string) (string, error) {
	key = strings.ToLower(key)
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).MatchString(key) {
		return "", Validation("Idempotency-Key", "invalid_format")
	}
	return key, nil
}
func ValidatePlacement(r PlaceRequest) error {
	if err := ValidateRequest(QuoteRequest{Items: r.Items, MunicipalityCode: r.Address.MunicipalityCode}); err != nil {
		var known *Error
		if errors.As(err, &known) && len(known.Fields) > 0 && known.Fields[0].Field == "municipality_code" {
			known.Fields[0].Field = "shipping_address.municipality_code"
		}
		return err
	}
	if !r.AcceptsDataPolicy {
		return Validation("accepts_data_policy", "required_consent")
	}
	address, err := mail.ParseAddress(r.Customer.Email)
	if err != nil || address.Address != r.Customer.Email || len(r.Customer.Email) > 254 {
		return Validation("customer.email", "invalid_format")
	}
	length := func(s string, min, max int) bool {
		n := utf8.RuneCountInString(s)
		return n >= min && n <= max && strings.TrimSpace(s) != ""
	}
	if !length(r.Customer.FullName, 3, 120) {
		return Validation("customer.full_name", "invalid_length")
	}
	phone := regexp.MustCompile(`^3[0-9]{9}$`)
	if r.Customer.Phone != nil && !phone.MatchString(*r.Customer.Phone) {
		return Validation("customer.phone", "invalid_format")
	}
	if !length(r.Address.RecipientName, 3, 120) {
		return Validation("shipping_address.recipient_name", "invalid_length")
	}
	if !phone.MatchString(r.Address.RecipientPhone) {
		return Validation("shipping_address.recipient_phone", "invalid_format")
	}
	if !length(r.Address.AddressLine1, 5, 200) {
		return Validation("shipping_address.address_line1", "invalid_length")
	}
	if r.Address.AddressLine2 != nil && utf8.RuneCountInString(*r.Address.AddressLine2) > 120 {
		return Validation("shipping_address.address_line2", "invalid_length")
	}
	if r.Address.PostalCode != nil && !regexp.MustCompile(`^[0-9]{6}$`).MatchString(*r.Address.PostalCode) {
		return Validation("shipping_address.postal_code", "invalid_format")
	}
	if r.Address.DeliveryNotes != nil && utf8.RuneCountInString(*r.Address.DeliveryNotes) > 300 {
		return Validation("shipping_address.delivery_notes", "invalid_length")
	}
	if r.Fiscal != nil {
		if r.Fiscal.PersonType != "natural" && r.Fiscal.PersonType != "legal" {
			return Validation("fiscal_data.person_type", "invalid_value")
		}
		if (r.Fiscal.PersonType == "legal" && r.Fiscal.DocumentType != "NIT") || (r.Fiscal.PersonType == "natural" && r.Fiscal.DocumentType != "CC" && r.Fiscal.DocumentType != "CE" && r.Fiscal.DocumentType != "PP") {
			return Validation("fiscal_data.document_type", "invalid_value")
		}
		if !length(r.Fiscal.DocumentNumber, 3, 20) || !regexp.MustCompile(`^[0-9A-Za-z-]+$`).MatchString(r.Fiscal.DocumentNumber) {
			return Validation("fiscal_data.document_number", "invalid_format")
		}
	}
	return nil
}
func TrackingToken(secret []byte, key string) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(strings.ToLower(key)))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func TokenHash(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}
func RequestHash(r PlaceRequest) (string, error) {
	body, err := json.Marshal(r)
	if err != nil {
		return "", err
	}
	return TokenHash(string(body)), nil
}

type PlacedOrder struct {
	OrderID              string    `json:"order_id"`
	OrderNumber          string    `json:"order_number"`
	Status               string    `json:"status"`
	TotalAmount          int64     `json:"total_amount"`
	ReservationExpiresAt time.Time `json:"reservation_expires_at"`
	TrackingToken        string    `json:"tracking_token,omitempty"`
}
type Allocation struct {
	VariantID, LotID, LotCode, ProductionDate string
	Quantity                                  int32
}
type Order struct {
	ID, Number, Key, RequestHash, TokenHash string
	Request                                 PlaceRequest
	Quote                                   Quote
	Allocations                             []Allocation
	PlacedAt, ExpiresAt                     time.Time
}

var ErrOrderNumberCollision = errors.New("order number collision")
var ErrCommitUncertain = errors.New("order commit outcome uncertain; do not release stock without reconciliation")

type PlacementTx interface {
	Replay(context.Context, string, time.Time) (*PlacedOrder, error)
	TokenExists(context.Context, string) (bool, error)
	NewID(context.Context) (string, error)
	Save(context.Context, Order) error
	Commit(context.Context) error
	Rollback(context.Context) error
}
type PlacementRepository interface {
	BeginPlacement(context.Context, string) (PlacementTx, error)
}
type InventoryPort interface {
	Allocate(context.Context, string, []Item) ([]Allocation, error)
	Release(context.Context, string) error
}
type AddressLookup interface {
	LookupAddress(string) (string, string, error)
}
type Clock interface{ Now() time.Time }
type OrderNumbers interface{ OrderNumber() (string, error) }
