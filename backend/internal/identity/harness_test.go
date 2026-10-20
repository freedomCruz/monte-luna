package identity_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/contracttest"
	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

const (
	ownerEmail    = "owner@example.test"
	ownerPassword = "owner fixture passphrase"
)

type harness struct {
	t        *testing.T
	module   *identity.Module
	mux      *http.ServeMux
	contract *contracttest.Contract
	pool     *pgxpool.Pool
	logs     *bytes.Buffer
	now      time.Time
	secrets  []string
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("identity_http"), pgcontainer.WithUsername("identity_http"), pgcontainer.WithPassword("identity_http"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	if err := identity.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	h := &harness{t: t, mux: http.NewServeMux(), contract: contracttest.Load(t, "identity.yaml"), pool: pool, logs: &bytes.Buffer{}, now: time.Date(2026, 10, 20, 15, 0, 0, 0, time.UTC)}
	cfg := identity.Config{EncryptionKey: bytes.Repeat([]byte{9}, 32), StorefrontBaseURL: "https://store.test"}
	h.module, err = identity.New(ctx, url, cfg, slog.New(slog.NewJSONHandler(h.logs, nil)), identity.Options{Now: func() time.Time { return h.now }})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(h.module.Close)
	h.module.RegisterRoutes(h.mux)
	var out, errs bytes.Buffer
	if code := h.module.RunCLI(ctx, []string{"create-owner", "--email", ownerEmail, "--name", "Owner"}, strings.NewReader(ownerPassword+"\n"), &out, &errs); code != 0 {
		t.Fatalf("bootstrap exit %d: %s", code, errs.String())
	}
	h.secrets = append(h.secrets, ownerPassword)
	t.Cleanup(func() {
		for _, secret := range h.secrets {
			if secret != "" && strings.Contains(h.logs.String(), secret) {
				t.Error("a credential reached the logs")
			}
		}
	})
	return h
}

// advance moves to a fresh 30-second TOTP step.
func (h *harness) advance() { h.now = h.now.Add(30 * time.Second) }

func (h *harness) code(secret string) string {
	h.t.Helper()
	code, err := totp.GenerateCodeCustom(secret, h.now, totp.ValidateOpts{Period: 30, Digits: otp.DigitsSix, Algorithm: otp.AlgorithmSHA1})
	if err != nil {
		h.t.Fatal(err)
	}
	h.secrets = append(h.secrets, secret)
	return code
}

type client struct {
	h      *harness
	cookie string
	ip     string
}

func (h *harness) client() *client { return &client{h: h, ip: "192.0.2.10"} }

type exchange struct {
	*httptest.ResponseRecorder
	body map[string]any
}

func (e exchange) str(key string) string {
	value, _ := e.body[key].(string)
	return value
}

type option func(*http.Request)

func header(name, value string) option { return func(r *http.Request) { r.Header.Set(name, value) } }

func (c *client) send(valid bool, method, path, body string, options ...option) exchange {
	c.h.t.Helper()
	var reader *strings.Reader
	if body != "" {
		reader = strings.NewReader(body)
	} else {
		reader = strings.NewReader("")
	}
	r := httptest.NewRequest(method, path, reader)
	r.RemoteAddr = c.ip + ":40000"
	if body != "" {
		media := "application/json"
		if method == http.MethodPatch {
			media = "application/merge-patch+json"
		}
		r.Header.Set("Content-Type", media)
	}
	if c.cookie != "" {
		r.AddCookie(&http.Cookie{Name: "__Host-session", Value: c.cookie})
	}
	for _, apply := range options {
		apply(r)
	}
	var rec *httptest.ResponseRecorder
	if valid {
		rec = c.h.contract.Do(c.h.t, c.h.mux, r)
	} else {
		rec = c.h.contract.DoInvalid(c.h.t, c.h.mux, r)
	}
	if values := rec.Header().Values("Cache-Control"); len(values) != 1 || values[0] != "no-store" {
		c.h.t.Fatalf("%s %s Cache-Control %q", method, path, values)
	}
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name != "__Host-session" {
			continue
		}
		if !cookie.Secure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.Domain != "" {
			c.h.t.Fatalf("unsafe session cookie attributes: %+v", cookie)
		}
		if cookie.MaxAge < 0 || cookie.Value == "" {
			c.cookie = ""
		} else {
			c.cookie = cookie.Value
		}
	}
	e := exchange{ResponseRecorder: rec}
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &e.body)
	}
	return e
}
func (c *client) do(method, path, body string, options ...option) exchange {
	c.h.t.Helper()
	return c.send(true, method, path, body, options...)
}
func (c *client) invalid(method, path, body string, options ...option) exchange {
	c.h.t.Helper()
	return c.send(false, method, path, body, options...)
}

func expect(t *testing.T, e exchange, status int, code string) {
	t.Helper()
	if e.Code != status || (code != "" && e.str("code") != code) {
		t.Fatalf("status %d code %q, want %d %q: %s", e.Code, e.str("code"), status, code, e.Body.String())
	}
}

// signIn performs password login plus TOTP verification for an enrolled admin.
func (c *client) signIn(email, password, secret string) exchange {
	c.h.t.Helper()
	login := c.do("POST", "/api/v1/admin/sessions", `{"email":"`+email+`","password":"`+password+`"}`)
	expect(c.h.t, login, 200, "")
	if login.str("next_step") != "totp_required" {
		c.h.t.Fatalf("next_step %q", login.str("next_step"))
	}
	c.h.advance()
	verified := c.do("POST", "/api/v1/admin/sessions/verify", `{"totp_code":"`+c.h.code(secret)+`"}`)
	expect(c.h.t, verified, 200, "")
	return verified
}

// enroll logs in an unenrolled admin and completes TOTP confirmation.
func (c *client) enroll(email, password string) (secret string, codes []string) {
	c.h.t.Helper()
	login := c.do("POST", "/api/v1/admin/sessions", `{"email":"`+email+`","password":"`+password+`"}`)
	expect(c.h.t, login, 200, "")
	if login.str("next_step") != "enrollment_required" {
		c.h.t.Fatalf("next_step %q", login.str("next_step"))
	}
	enrolled := c.do("POST", "/api/v1/admin/totp/enroll", "")
	expect(c.h.t, enrolled, 200, "")
	secret = enrolled.str("secret")
	c.h.advance()
	confirmed := c.do("POST", "/api/v1/admin/totp/confirm", `{"totp_code":"`+c.h.code(secret)+`"}`)
	expect(c.h.t, confirmed, 200, "")
	for _, code := range confirmed.body["recovery_codes"].([]any) {
		codes = append(codes, code.(string))
	}
	c.h.secrets = append(c.h.secrets, codes...)
	return secret, codes
}

func (h *harness) latestToken(eventType string) (admin, token string) {
	h.t.Helper()
	var encrypted string
	if err := h.pool.QueryRow(h.t.Context(), `SELECT payload->>'admin_user_id', payload->>'raw_token_encrypted' FROM identity.outbox WHERE type=$1 ORDER BY occurred_at DESC, id DESC LIMIT 1`, eventType).Scan(&admin, &encrypted); err != nil {
		h.t.Fatal(err)
	}
	token, err := h.module.Links().Decrypt(h.t.Context(), admin, encrypted)
	if err != nil {
		h.t.Fatal(err)
	}
	h.secrets = append(h.secrets, token)
	return admin, token
}

func (h *harness) count(query string, args ...any) int {
	h.t.Helper()
	var n int
	if err := h.pool.QueryRow(h.t.Context(), query, args...).Scan(&n); err != nil {
		h.t.Fatal(err)
	}
	return n
}

// step runs a subtest whose helper failures stop that subtest only.
func (h *harness) step(name string, fn func(t *testing.T)) {
	parent := h.t
	parent.Run(name, func(t *testing.T) {
		h.t = t
		defer func() { h.t = parent }()
		fn(t)
	})
}
