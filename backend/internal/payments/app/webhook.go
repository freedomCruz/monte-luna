package app

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

// VerifyWebhook resolves the provider's ordered paths dynamically relative to
// data. JSON numbers retain their exact decimal representation (no float64).
func VerifyWebhook(body []byte, header, secret string) (domain.Transaction, string, error) {
	reject := func() (domain.Transaction, string, error) {
		return domain.Transaction{}, "", domain.Problem(401, "invalid_webhook_checksum")
	}
	var payload map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return domain.Transaction{}, "", domain.Problem(400, "bad_request")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return domain.Transaction{}, "", domain.Problem(400, "bad_request")
	}
	provided, err := hex.DecodeString(header)
	if err != nil || len(provided) != sha256.Size {
		return reject()
	}
	signature, ok := payload["signature"].(map[string]any)
	if !ok {
		return reject()
	}
	properties, ok := signature["properties"].([]any)
	if !ok || len(properties) == 0 {
		return reject()
	}
	timestamp, ok := payload["timestamp"].(json.Number)
	if !ok {
		return reject()
	}
	if _, err := timestamp.Int64(); err != nil {
		return reject()
	}
	var values strings.Builder
	for _, property := range properties {
		path, ok := property.(string)
		if !ok || path == "" {
			return reject()
		}
		value := payload["data"]
		for _, part := range strings.Split(path, ".") {
			object, ok := value.(map[string]any)
			if !ok {
				return reject()
			}
			value, ok = object[part]
			if !ok {
				return reject()
			}
		}
		switch scalar := value.(type) {
		case string:
			values.WriteString(scalar)
		case json.Number:
			values.WriteString(string(scalar))
		case bool:
			if scalar {
				values.WriteString("true")
			} else {
				values.WriteString("false")
			}
		default:
			return reject()
		}
	}
	values.WriteString(string(timestamp))
	values.WriteString(secret)
	sum := sha256.Sum256([]byte(values.String()))
	if subtle.ConstantTimeCompare(provided, sum[:]) != 1 {
		return reject()
	}
	signatureChecksum, ok := signature["checksum"].(string)
	if !ok {
		return reject()
	}
	signatureBytes, err := hex.DecodeString(signatureChecksum)
	if err != nil || subtle.ConstantTimeCompare(signatureBytes, sum[:]) != 1 {
		return reject()
	}
	var envelope struct {
		Event string `json:"event"`
		Data  struct {
			Transaction domain.Transaction `json:"transaction"`
		} `json:"data"`
		Environment string `json:"environment"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return domain.Transaction{}, "", domain.Problem(422, "validation_failed")
	}
	transaction := envelope.Data.Transaction
	if envelope.Event != "transaction.updated" || (envelope.Environment != "test" && envelope.Environment != "prod") || transaction.ID == "" || transaction.Reference == "" || transaction.Amount <= 0 || transaction.Currency != "COP" {
		return domain.Transaction{}, "", domain.Problem(422, "validation_failed")
	}
	if _, err := domain.ProviderStatus(transaction.Status); err != nil {
		return domain.Transaction{}, "", err
	}
	if transaction.Method != nil {
		switch *transaction.Method {
		case "CARD", "PSE", "NEQUI", "BANCOLOMBIA_TRANSFER":
		default:
			return domain.Transaction{}, "", domain.Problem(422, "validation_failed")
		}
	}
	return transaction, hex.EncodeToString(sum[:]), nil
}
