package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity"
	"github.com/freedomCruz/monte-luna/backend/internal/notifications"
	"github.com/freedomCruz/monte-luna/backend/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	pgcontainer "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func runMigrations(ctx context.Context, t *testing.T, db *sql.DB) {
	t.Helper()
	if err := identity.Migrate(ctx, db); err != nil {
		t.Fatalf("identity migration failed: %v", err)
	}
	if err := notifications.Migrate(ctx, db); err != nil {
		t.Fatalf("notifications migration failed: %v", err)
	}
}

func setupTestDB(ctx context.Context, t *testing.T) (*sql.DB, string) {
	t.Helper()
	container, err := pgcontainer.Run(ctx, "postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c", pgcontainer.WithDatabase("notifications_identity_test"), pgcontainer.WithUsername("test_user"), pgcontainer.WithPassword("test_pass"), pgcontainer.BasicWaitStrategies())
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, connStr
}

func randomKey(t *testing.T) string {
	t.Helper()
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buf)
}

func TestIdentityNotificationsIntegrationE2E(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Minute)
	defer cancel()

	db, connStr := setupTestDB(ctx, t)
	runMigrations(ctx, t, db)

	encKey := randomKey(t)
	storefrontURL := "https://storefront.example.test"
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	identityCfg, err := identity.LoadConfig(func(key string) string {
		switch key {
		case "APP_ENCRYPTION_KEY":
			return encKey
		case "STOREFRONT_BASE_URL":
			return storefrontURL
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatalf("load identity config: %v", err)
	}

	admins, err := identity.New(ctx, connStr, identityCfg, logger, identity.Options{})
	if err != nil {
		t.Fatalf("new identity module: %v", err)
	}
	defer admins.Close()

	notifCfg := notifications.Config{
		Sender:          notifications.SenderCapture,
		CleanupInterval: time.Hour,
		HTTPTimeout:     5 * time.Second,
	}
	captureSender := notifications.NewCaptureSender()
	notify, err := notifications.New(ctx, connStr, notifCfg, logger, notifications.Options{Sender: captureSender})
	if err != nil {
		t.Fatalf("new notifications module: %v", err)
	}
	defer notify.Close()

	// Build the thin adapters
	decryptor, err := newIdentityTokenDecryptor(admins.Links())
	if err != nil {
		t.Fatalf("new decryptor adapter: %v", err)
	}
	linkBuilder, err := newIdentityLinkBuilder(admins.Links())
	if err != nil {
		t.Fatalf("new link builder adapter: %v", err)
	}

	notifyConsumer, err := notify.Consumer(decryptor, linkBuilder)
	if err != nil {
		t.Fatalf("new notifications consumer: %v", err)
	}

	relayPool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("new relay pool: %v", err)
	}
	defer relayPool.Close()

	relay, err := platform.NewRelay(relayPool, []string{"identity"}, platform.DefaultRelayConfig(), logger)
	if err != nil {
		t.Fatalf("new relay: %v", err)
	}
	relay.Subscribe("identity.password_reset_requested", notifyConsumer)
	relay.Subscribe("identity.admin_invited", notifyConsumer)

	mux := http.NewServeMux()
	admins.RegisterRoutes(mux)
	notify.RegisterRoutes(mux)

	// Enroll root admin via CLI first so we have an owner to make HTTP calls
	var cliOut, cliErr strings.Builder
	exitCode := admins.RunCLI(ctx, []string{"create-owner", "--email", "superadmin@example.test", "--name", "Super Admin"}, strings.NewReader("Passphrase12345678!\n"), &cliOut, &cliErr)
	if exitCode != 0 {
		t.Fatalf("create-owner CLI failed: %s %s", cliOut.String(), cliErr.String())
	}

	// Drain any outbox events from create-admin CLI (CLI does not publish outbox events)
	_, _ = relay.Poll(ctx, time.Now())

	server := httptest.NewServer(mux)
	defer server.Close()

	client := server.Client()
	postJSON := func(endpoint, body string) (*http.Response, string) {
		req, err := http.NewRequestWithContext(ctx, "POST", server.URL+endpoint, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		respBody, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		return resp, string(respBody)
	}

	t.Run("PasswordResetRequested E2E Delivery and Link Acceptance", func(t *testing.T) {
		// Request a password reset for superadmin@example.test
		resp, body := postJSON("/api/v1/admin/password-resets", `{"email":"superadmin@example.test"}`)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("password reset request failed: %d %s", resp.StatusCode, body)
		}

		// Verify event was queued in identity.outbox
		var outboxCount int
		err := db.QueryRowContext(ctx, `SELECT count(*) FROM identity.outbox WHERE type='identity.password_reset_requested' AND status='pending'`).Scan(&outboxCount)
		if err != nil || outboxCount != 1 {
			t.Fatalf("expected 1 pending outbox event, got %d, err: %v", outboxCount, err)
		}

		// Relay poll: drain the event and deliver via notifications consumer
		polled, err := relay.Poll(ctx, time.Now())
		if err != nil {
			t.Fatalf("relay poll failed: %v", err)
		}
		if polled != 1 {
			t.Fatalf("expected 1 event polled, got %d", polled)
		}

		// Check outbox delivered
		var outboxStatus string
		_ = db.QueryRowContext(ctx, `SELECT status FROM identity.outbox WHERE type='identity.password_reset_requested'`).Scan(&outboxStatus)
		if outboxStatus != "delivered" {
			t.Fatalf("expected outbox status delivered, got %q", outboxStatus)
		}

		// Check notifications.email_messages
		var msgStatus, templateKey, recipient string
		err = db.QueryRowContext(ctx, `SELECT status, template_key, recipient_email FROM notifications.email_messages WHERE template_key='password_reset'`).Scan(&msgStatus, &templateKey, &recipient)
		if err != nil {
			t.Fatalf("query email message: %v", err)
		}
		if msgStatus != "sent" || recipient != "superadmin@example.test" {
			t.Fatalf("email message status=%q recipient=%q", msgStatus, recipient)
		}

		// Check capture sender: get the captured email
		msgs := notifications.CapturedMessages(captureSender)
		if len(msgs) != 1 {
			t.Fatalf("expected 1 captured email, got %d", len(msgs))
		}
		captured := msgs[0]
		if captured.Subject != "Restablece tu contraseña de administrador de Monteluna" {
			t.Fatalf("unexpected password reset subject: %s", captured.Subject)
		}
		if !strings.Contains(captured.Text, "Restablecer mi contraseña") || !strings.Contains(captured.HTML, "Restablecer mi contraseña") {
			t.Fatalf("expected 'Restablecer mi contraseña' in password reset email")
		}
		if !strings.Contains(captured.Text, "vencerá en 30 minutos") || !strings.Contains(captured.HTML, "vencerá en 30 minutos") {
			t.Fatalf("expected 'vencerá' in password reset email")
		}
		if !strings.Contains(captured.Text, "Si tú no solicitaste este cambio") || !strings.Contains(captured.HTML, "Si tú no solicitaste este cambio") {
			t.Fatalf("expected 'Si tú no' in password reset email")
		}
		if !strings.Contains(captured.Text, "tu contraseña actual continuará siendo segura") || !strings.Contains(captured.HTML, "tu contraseña actual continuará siendo segura") {
			t.Fatalf("expected 'contraseña actual continuará' in password reset email")
		}
		if !strings.Contains(captured.Text, storefrontURL+"/admin/restablecer-contrasena#token=") {
			t.Fatalf("link does not match approved URL format: %s", captured.Text)
		}

		// Extract token from fragment
		uIdx := strings.Index(captured.Text, storefrontURL+"/admin/restablecer-contrasena#token=")
		linkPart := strings.Fields(captured.Text[uIdx:])[0]
		parsedURL, err := url.Parse(linkPart)
		if err != nil {
			t.Fatalf("parse link: %v", linkPart)
		}
		token := strings.TrimPrefix(parsedURL.Fragment, "token=")
		if token == "" {
			t.Fatalf("token empty in link %s", linkPart)
		}

		// Ensure no secrets or tokens leaked into DB
		var dbSnapshot strings.Builder
		rows, _ := db.QueryContext(ctx, `SELECT payload::text FROM identity.outbox`)
		for rows.Next() {
			var p string
			_ = rows.Scan(&p)
			dbSnapshot.WriteString(p)
		}
		_ = rows.Close()
		rows2, _ := db.QueryContext(ctx, `SELECT template_data::text FROM notifications.email_messages`)
		for rows2.Next() {
			var d string
			_ = rows2.Scan(&d)
			dbSnapshot.WriteString(d)
		}
		_ = rows2.Close()
		allDB := dbSnapshot.String()
		if strings.Contains(allDB, token) {
			t.Fatalf("plaintext token leaked in database: %s", token)
		}
		if strings.Contains(allDB, "restablecer-contrasena") {
			t.Fatalf("link leaked in database: %s", allDB)
		}

		// Verify reset completion endpoint accepts the extracted token
		newPass := "NewPassphrase12345678!"
		completeResp, cBody := postJSON("/api/v1/admin/password-resets/complete", `{"token":"`+token+`","new_password":"`+newPass+`"}`)
		if completeResp.StatusCode != http.StatusOK {
			t.Fatalf("password reset completion failed: %d %s", completeResp.StatusCode, cBody)
		}

		// Idempotent redelivery of the same event: re-running Handle does not resend or fail
		// Poll relay again should do nothing
		polledAgain, err := relay.Poll(ctx, time.Now())
		if err != nil || polledAgain != 0 {
			t.Fatalf("expected 0 polled again, got %d, err %v", polledAgain, err)
		}
		// Captured message count should still be 1
		if len(notifications.CapturedMessages(captureSender)) != 1 {
			t.Fatalf("expected idempotent delivery without extra email, got %d emails", len(notifications.CapturedMessages(captureSender)))
		}
	})

	t.Run("AdminInvited E2E Role Translation, Link Acceptance and Invalid Role Rejection", func(t *testing.T) {
		// 1. First test invalid roles in admin_invited event: must be rejected without sending
		for _, invalidRole := range []string{"superadmin", "invalid", "equipo", "propietario", ""} {
			evID := "019a0000-0000-7000-8000-000000000099"
			payload := `{"admin_user_id":"019a0000-0000-7000-8000-000000000002","email":"invalid@example.test","display_name":"Inv","raw_token_encrypted":"FAKE","role":"` + invalidRole + `"}`
			err := notifyConsumer(ctx, platform.Event{
				ID:      evID,
				Type:    "identity.admin_invited",
				Payload: []byte(payload),
			})
			if err == nil {
				t.Fatalf("expected error for invalid role %q, got nil", invalidRole)
			}
		}

		// 2. Now test valid staff invitation and owner invitation
		// Create a second user via reset-password request to get valid token in DB and payload
		// First create a new admin via create-owner or let's create a user in identity.users or use password reset
		// Wait, can we request password reset for an email that exists?
		// Let's create an admin or check if we can insert directly into outbox copying the valid payload from reset-requested
		// with type='identity.admin_invited' and role='staff' / 'owner'!
		// Request a fresh password reset to have an active token in identity.password_tokens
		resp, body := postJSON("/api/v1/admin/password-resets", `{"email":"superadmin@example.test"}`)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("password reset request failed: %d %s", resp.StatusCode, body)
		}
		// Drain the reset event generated by the request so only our inserted invite event will be polled next
		polledReset, err := relay.Poll(ctx, time.Now())
		if err != nil || polledReset != 1 {
			t.Fatalf("expected 1 polled reset, got %d, err %v", polledReset, err)
		}
		var adminUserID, email, displayName, rawTokenEncrypted string
		var rawPayload []byte
		err = db.QueryRowContext(ctx, `SELECT payload FROM identity.outbox WHERE type='identity.password_reset_requested' ORDER BY occurred_at DESC, id DESC LIMIT 1`).Scan(&rawPayload)
		if err != nil {
			t.Fatalf("query previous outbox payload: %v", err)
		}

		var resetPayload struct {
			AdminUserID       string `json:"admin_user_id"`
			Email             string `json:"email"`
			DisplayName       string `json:"display_name"`
			RawTokenEncrypted string `json:"raw_token_encrypted"`
		}
		if err := json.Unmarshal(rawPayload, &resetPayload); err != nil {
			t.Fatalf("unmarshal reset payload: %v", err)
		}
		adminUserID = resetPayload.AdminUserID
		email = resetPayload.Email
		displayName = resetPayload.DisplayName
		rawTokenEncrypted = resetPayload.RawTokenEncrypted

		// Test Staff Invitation: should render role as "equipo"
		staffEvID := "019a0000-0000-7000-8000-000000000101"
		staffPayload := map[string]string{
			"admin_user_id":       adminUserID,
			"email":               email,
			"display_name":        displayName,
			"raw_token_encrypted": rawTokenEncrypted,
			"role":                "staff",
		}
		staffBytes, _ := json.Marshal(staffPayload)
		// Insert into identity.outbox
		now := time.Now()
		_, err = db.ExecContext(ctx, `INSERT INTO identity.outbox(id, type, occurred_at, payload, status, available_at, updated_at) VALUES($1, 'identity.admin_invited', $2, $3, 'pending', $2, $2)`, staffEvID, now, staffBytes)
		if err != nil {
			t.Fatalf("insert staff invitation outbox: %v", err)
		}

		polled, err := relay.Poll(ctx, now)
		if err != nil || polled != 1 {
			t.Fatalf("expected 1 polled staff invite, got %d, err %v", polled, err)
		}

		msgs := notifications.CapturedMessages(captureSender)
		if len(msgs) != 3 {
			t.Fatalf("expected 3 captured messages now, got %d", len(msgs))
		}
		staffEmail := msgs[2]
		if staffEmail.Subject != "Invitación para administrar Monteluna" {
			t.Fatalf("unexpected staff invite subject: %s", staffEmail.Subject)
		}
		if !strings.Contains(staffEmail.HTML, "rol de equipo") || !strings.Contains(staffEmail.Text, "rol de equipo") {
			t.Fatalf("staff invitation did not render 'rol de equipo': %s", staffEmail.Text)
		}
		if !strings.Contains(staffEmail.HTML, "Al definir tu contraseña, se te solicitará configurar tu autenticación en dos pasos (TOTP).") ||
			!strings.Contains(staffEmail.Text, "Al definir tu contraseña, se te solicitará configurar tu autenticación en dos pasos (TOTP).") {
			t.Fatalf("staff invitation did not render accented TOTP copy: %s", staffEmail.Text)
		}
		if !strings.Contains(staffEmail.HTML, "Este enlace vencerá en 30 minutos.") ||
			!strings.Contains(staffEmail.Text, "Este enlace vencerá en 30 minutos.") {
			t.Fatalf("staff invitation did not render 'vencerá': %s", staffEmail.Text)
		}
		if !strings.Contains(staffEmail.Text, storefrontURL+"/admin/invitacion#token=") {
			t.Fatalf("staff invitation did not render approved link: %s", staffEmail.Text)
		}

		// Verify invitation completion endpoint accepts the extracted token
		invIdx := strings.Index(staffEmail.Text, storefrontURL+"/admin/invitacion#token=")
		invLinkPart := strings.Fields(staffEmail.Text[invIdx:])[0]
		parsedInvURL, err := url.Parse(invLinkPart)
		if err != nil {
			t.Fatalf("parse invite link: %v", invLinkPart)
		}
		invToken := strings.TrimPrefix(parsedInvURL.Fragment, "token=")
		staffPass := "StaffPassphrase12345678!"
		invCompleteResp, invBody := postJSON("/api/v1/admin/password-resets/complete", `{"token":"`+invToken+`","new_password":"`+staffPass+`"}`)
		if invCompleteResp.StatusCode != http.StatusOK {
			t.Fatalf("invitation completion failed: %d %s", invCompleteResp.StatusCode, invBody)
		}

		// Test Owner Invitation: should render role as "propietario"
		ownerEvID := "019a0000-0000-7000-8000-000000000102"
		ownerPayload := map[string]string{
			"admin_user_id":       adminUserID,
			"email":               email,
			"display_name":        displayName,
			"raw_token_encrypted": rawTokenEncrypted,
			"role":                "owner",
		}
		ownerBytes, _ := json.Marshal(ownerPayload)
		_, err = db.ExecContext(ctx, `INSERT INTO identity.outbox(id, type, occurred_at, payload, status, available_at, updated_at) VALUES($1, 'identity.admin_invited', $2, $3, 'pending', $2, $2)`, ownerEvID, now, ownerBytes)
		if err != nil {
			t.Fatalf("insert owner invitation outbox: %v", err)
		}

		polledOwner, err := relay.Poll(ctx, now)
		if err != nil || polledOwner != 1 {
			t.Fatalf("expected 1 polled owner invite, got %d, err %v", polledOwner, err)
		}

		msgs = notifications.CapturedMessages(captureSender)
		if len(msgs) != 4 {
			t.Fatalf("expected 4 captured messages now, got %d", len(msgs))
		}
		ownerEmail := msgs[3]
		if ownerEmail.Subject != "Invitación para administrar Monteluna" {
			t.Fatalf("unexpected owner invite subject: %s", ownerEmail.Subject)
		}
		if !strings.Contains(ownerEmail.HTML, "rol de propietario") || !strings.Contains(ownerEmail.Text, "rol de propietario") {
			t.Fatalf("owner invitation did not render 'rol de propietario': %s", ownerEmail.Text)
		}
		if !strings.Contains(ownerEmail.HTML, "Al definir tu contraseña, se te solicitará configurar tu autenticación en dos pasos (TOTP).") ||
			!strings.Contains(ownerEmail.Text, "Al definir tu contraseña, se te solicitará configurar tu autenticación en dos pasos (TOTP).") {
			t.Fatalf("owner invitation did not render accented TOTP copy: %s", ownerEmail.Text)
		}
		if !strings.Contains(ownerEmail.HTML, "Este enlace vencerá en 30 minutos.") ||
			!strings.Contains(ownerEmail.Text, "Este enlace vencerá en 30 minutos.") {
			t.Fatalf("owner invitation did not render 'vencerá': %s", ownerEmail.Text)
		}
		if !strings.Contains(ownerEmail.Text, storefrontURL+"/admin/invitacion#token=") {
			t.Fatalf("owner invitation did not render approved link: %s", ownerEmail.Text)
		}
	})
}
