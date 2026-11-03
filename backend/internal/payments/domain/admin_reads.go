package domain

import "time"

// AdminAttempt deliberately excludes gateway payloads, credentials and messages.
type AdminAttempt struct {
	ID          string     `json:"id"`
	Reference   string     `json:"reference"`
	Status      string     `json:"status"`
	Method      *string    `json:"payment_method_type"`
	ProviderID  *string    `json:"provider_transaction_id"`
	CreatedAt   time.Time  `json:"created_at"`
	FinalizedAt *time.Time `json:"finalized_at"`
}
type AdminPaymentSummary struct {
	Status string  `json:"status"`
	Method *string `json:"payment_method_type"`
}
