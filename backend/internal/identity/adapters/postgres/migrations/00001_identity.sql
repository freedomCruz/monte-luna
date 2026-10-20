-- +goose Up
CREATE TABLE identity.admin_users (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
    role text NOT NULL CHECK (role IN ('owner','staff')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$v=19$%'),
    password_changed_at timestamptz NOT NULL DEFAULT now(),
    session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
    failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
    locked_until timestamptz,
    last_login_at timestamptz,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.admin_totp_credentials (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id uuid NOT NULL UNIQUE REFERENCES identity.admin_users(id) ON DELETE CASCADE,
    secret_encrypted bytea NOT NULL,
    confirmed_at timestamptz,
    last_used_step bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.admin_recovery_codes (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id uuid NOT NULL REFERENCES identity.admin_users(id) ON DELETE CASCADE,
    code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_recovery_codes_user_idx ON identity.admin_recovery_codes(admin_user_id);
CREATE TABLE identity.password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id uuid NOT NULL REFERENCES identity.admin_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_password_tokens_user_idx ON identity.password_reset_tokens(admin_user_id);
CREATE TABLE identity.sessions (
    token text PRIMARY KEY,
    data bytea NOT NULL,
    expiry timestamptz NOT NULL
);
CREATE INDEX identity_sessions_expiry_idx ON identity.sessions(expiry);
CREATE TABLE identity.security_events (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id uuid REFERENCES identity.admin_users(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'login_succeeded','login_failed','logout','password_changed',
        'password_reset_requested','password_reset_completed','totp_enabled',
        'totp_reset','recovery_code_used','role_changed','user_disabled','user_created'
    )),
    ip_address inet,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_security_events_user_time_idx ON identity.security_events(admin_user_id,created_at);
CREATE INDEX identity_security_events_retention_idx ON identity.security_events(created_at,id);
CREATE TABLE identity.outbox (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    type text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_outbox_pending_idx ON identity.outbox(available_at,id) WHERE status='pending';
CREATE TABLE identity.processed_events (
    id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_processed_events_retention_idx ON identity.processed_events(processed_at,id);

-- +goose Down
DROP TABLE identity.processed_events;
DROP TABLE identity.outbox;
DROP TABLE identity.security_events;
DROP TABLE identity.sessions;
DROP TABLE identity.password_reset_tokens;
DROP TABLE identity.admin_recovery_codes;
DROP TABLE identity.admin_totp_credentials;
DROP TABLE identity.admin_users;
