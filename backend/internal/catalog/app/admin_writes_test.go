package app

import (
	"context"
	"encoding/json"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"testing"
)

type adminWriteFake struct{ calls int }

func (f *adminWriteFake) WriteAdmin(_ context.Context, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	f.calls++
	return domain.AdminWriteResult{ProductVersion: in.Version + 1}, nil
}
func TestAdminWritesRejectBeforeRepository(t *testing.T) {
	for _, tt := range []struct {
		kind, body string
		version    int32
		ok         bool
	}{
		{"create-product", `{"title":"name","slug":"name","product_type_id":"id","attributes":{}}`, 0, true},
		{"update-product", `{"title":"name"}`, 1, true},
		{"update-product", `{"title":"name"}`, 0, false},
		{"update-product", `{"product_type_id":"id"}`, 1, false},
		{"update-variant", `{"quantity":1}`, 1, false},
		{"update-product", `{"title":null}`, 1, false},
		{"create-variant", `{"sku":"x"}`, 1, false},
		{"receipt", `{"lot_code":"X","production_date":"2026-01-01","quantity":0}`, 1, false},
		{"receipt", `{"lot_code":"X","production_date":"2026-01-01","quantity":-1}`, 1, false},
		{"receipt", `{"lot_code":"X","production_date":"2026-01-02","expiration_date":"2026-01-01","quantity":1}`, 1, false},
		{"receipt", `{"lot_code":"X","production_date":"2026-01-01","quantity":1}`, 1, true},
	} {
		t.Run(tt.kind+tt.body, func(t *testing.T) {
			repo := &adminWriteFake{}
			s := NewAdminWrites(repo, nil)
			var fields map[string]json.RawMessage
			if err := json.Unmarshal([]byte(tt.body), &fields); err != nil {
				t.Fatal(err)
			}
			_, err := s.Write(t.Context(), domain.AdminWrite{Kind: tt.kind, Fields: fields, Version: tt.version, ActorID: "01946894-3d9a-7c98-b807-6c84c1762c30"})
			if (err == nil) != tt.ok || repo.calls != map[bool]int{true: 1, false: 0}[tt.ok] {
				t.Fatalf("calls %d err %v", repo.calls, err)
			}
		})
	}
}
