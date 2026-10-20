package identity

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cli"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/cryptography"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/httpapi"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/postgres"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/ratelimit"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/adapters/session"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/app"
	"github.com/freedomCruz/monte-luna/backend/internal/identity/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TOTPIssuer labels enrollment entries in authenticator apps.
const TOTPIssuer = "Monteluna"

func Migrate(ctx context.Context, db *sql.DB) error { return postgres.Migrate(ctx, db) }

// Down is for disposable test databases only, never production operations.
func Down(ctx context.Context, db *sql.DB) error { return postgres.Down(ctx, db) }

// Options are test seams; production leaves them empty.
type Options struct {
	Now func() time.Time
}

type Module struct {
	pool       *pgxpool.Pool
	http       *httpapi.HTTP
	sessions   *postgres.SessionStore
	management *app.Management
	cli        *cli.Runner
	links      *OneTimeLinks
	access     *Authorizer
	logger     *slog.Logger
}

func New(ctx context.Context, databaseURL string, cfg Config, logger *slog.Logger, options Options) (*Module, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(startup, databaseURL)
	if err != nil {
		return nil, errors.New("initialize identity PostgreSQL pool")
	}
	if err := pool.Ping(startup); err != nil {
		pool.Close()
		return nil, errors.New("connect identity PostgreSQL pool")
	}
	m, err := assemble(pool, cfg, logger, now)
	if err != nil {
		pool.Close()
		return nil, err
	}
	return m, nil
}

func assemble(pool *pgxpool.Pool, cfg Config, logger *slog.Logger, now func() time.Time) (*Module, error) {
	repo := postgres.NewRepository(pool)
	store := postgres.NewSessionStore(pool)
	hasher := cryptography.NewHasher(nil)
	tokens := cryptography.NewResetTokens(nil)
	cipher, err := cryptography.NewCipher(cfg.EncryptionKey, nil)
	if err != nil {
		return nil, err
	}
	factors, err := cryptography.NewFactors(TOTPIssuer, nil)
	if err != nil {
		return nil, err
	}
	limiter, err := ratelimit.New(ratelimit.Config{AccountPerSecond: AccountAttemptsPerMin / 60.0, IPPerSecond: IPAttemptsPerMin / 60.0, AccountBurst: AccountBurst, IPBurst: IPBurst, MaxKeys: LimiterMaxKeys, IdleTTL: LimiterIdleEviction})
	if err != nil {
		return nil, err
	}
	// Unknown accounts verify against this hash so timing matches real users.
	unknown, _, err := tokens.Generate()
	if err != nil {
		return nil, err
	}
	dummy, err := hasher.Hash(unknown)
	if err != nil {
		return nil, err
	}
	policy := domain.LengthPolicy(PasswordMinLength, PasswordMaxLength)
	auth, err := app.NewAuth(repo, hasher, cipher, factors, limiter, now, app.AuthConfig{LockoutThreshold: LockoutThreshold, LockoutDuration: LockoutDuration, RecoveryCount: RecoveryCodeCount, RecoveryBytes: RecoveryCodeBytes, DummyPasswordHash: dummy})
	if err != nil {
		return nil, err
	}
	sessions, err := session.New(store, auth, session.Config{Lifetime: SessionLifetime, IdleTimeout: SessionIdleTimeout, PendingLifetime: PendingSessionLifetime})
	if err != nil {
		return nil, err
	}
	issuer, err := app.NewTokenIssuer(cipher, tokens)
	if err != nil {
		return nil, err
	}
	management, err := app.NewManagement(repo, auth, hasher, issuer, app.ManagementConfig{Now: now, PasswordPolicy: policy})
	if err != nil {
		return nil, err
	}
	resets, err := app.NewPasswordResets(repo, hasher, cipher, tokens, limiter, now, policy)
	if err != nil {
		return nil, err
	}
	handler, err := httpapi.New(httpapi.Deps{Auth: auth, Management: management, Resets: resets, Sessions: sessions, PasswordPolicy: policy, Logger: logger})
	if err != nil {
		return nil, err
	}
	// A code point is at most four UTF-8 bytes.
	runner, err := cli.New(management, cli.Config{MaxPasswordBytes: 4 * PasswordMaxLength})
	if err != nil {
		return nil, err
	}
	links, err := NewOneTimeLinks(cfg)
	if err != nil {
		return nil, err
	}
	access, err := NewAuthorizer(auth, sessions)
	if err != nil {
		return nil, err
	}
	return &Module{pool: pool, http: handler, sessions: store, management: management, cli: runner, links: links, access: access, logger: logger}, nil
}

func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.http.RegisterRoutes(mux) }

// Links is the public one-time-link facade for the Notifications consumer.
func (m *Module) Links() *OneTimeLinks { return m.links }

// Access checks a role for another module's admin route inside SCS LoadAndSave.
func (m *Module) Access() AccessChecker { return m.access }

// RunCLI executes one SSH administration command. Passwords come from stdin.
func (m *Module) RunCLI(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	return m.cli.Run(ctx, args, stdin, stdout, stderr)
}

// Cleanup removes one bounded batch each of expired sessions, security events
// older than the 1-year retention, and password tokens consumed or expired
// more than 7 days ago.
func (m *Module) Cleanup(ctx context.Context) error {
	_, sessionErr := m.sessions.DeleteExpired(ctx, MaintenanceBatch)
	_, eventErr := m.management.CleanupSecurityEvents(ctx, MaintenanceBatch)
	_, tokenErr := m.management.CleanupPasswordTokens(ctx, MaintenanceBatch)
	return errors.Join(sessionErr, eventErr, tokenErr)
}

// RunJobs must be joined before Close; it never starts its own goroutines.
func (m *Module) RunJobs(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := m.Cleanup(ctx); err != nil && ctx.Err() == nil {
				m.logger.Error("identity cleanup failed")
			}
		}
	}
}

func (m *Module) Close() { m.pool.Close() }

// CLIUsage documents the SSH administration commands; printing it needs no
// configuration or database.
const CLIUsage = cli.Usage
