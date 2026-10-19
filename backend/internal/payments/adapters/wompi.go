package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/payments/domain"
)

type Wompi struct {
	baseURL, privateKey string
	client              *http.Client
}

func NewWompi(baseURL, privateKey string, client *http.Client) *Wompi {
	return &Wompi{baseURL: strings.TrimRight(baseURL, "/"), privateKey: privateKey, client: client}
}
func (w *Wompi) Fetch(ctx context.Context, id, reference string) (*domain.Transaction, error) {
	path := "/v1/transactions/" + url.PathEscape(id)
	if id == "" {
		// UNVERIFIED: this private-key reference filter and response shape are not
		// documented by Wompi. Confirm in sandbox (payments-v1 M1) before production.
		if reference == "" {
			return nil, nil
		}
		path = "/v1/transactions?reference=" + url.QueryEscape(reference)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.baseURL+path, nil)
	if err != nil {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	req.Header.Set("Authorization", "Bearer "+w.privateKey)
	response, err := w.client.Do(req)
	if err != nil {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&envelope); err != nil {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	var result domain.Transaction
	if id != "" {
		err = json.Unmarshal(envelope.Data, &result)
	} else {
		var candidates []domain.Transaction
		err = json.Unmarshal(envelope.Data, &candidates)
		if err == nil {
			for _, candidate := range candidates {
				if candidate.Reference == reference {
					if result.ID != "" {
						return nil, domain.Problem(503, "payment_provider_unavailable")
					}
					result = candidate
				}
			}
		}
	}
	if err != nil || result.ID == "" || result.Reference == "" || result.Amount <= 0 || result.Currency != "COP" {
		return nil, domain.Problem(503, "payment_provider_unavailable")
	}
	if id != "" && result.ID != id {
		return nil, errors.New("provider returned an inconsistent transaction identifier")
	}
	return &result, nil
}
