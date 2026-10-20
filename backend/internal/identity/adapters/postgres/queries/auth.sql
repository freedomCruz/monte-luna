-- name: FindAdminByEmailForUpdate :one
SELECT * FROM identity.admin_users WHERE email=$1 FOR UPDATE;

-- name: GetTOTP :one
SELECT * FROM identity.admin_totp_credentials WHERE admin_user_id=$1;

-- name: ListUnusedRecoveryHashes :many
SELECT code_hash FROM identity.admin_recovery_codes WHERE admin_user_id=$1 AND used_at IS NULL ORDER BY id;

-- name: SaveAuthUser :exec
UPDATE identity.admin_users SET password_hash=$2,failed_login_attempts=$3,
 locked_until=$4,last_login_at=$5,updated_at=now() WHERE id=$1;

-- name: SaveTOTP :exec
INSERT INTO identity.admin_totp_credentials(admin_user_id,secret_encrypted,confirmed_at,last_used_step)
VALUES($1,$2,$3,$4) ON CONFLICT(admin_user_id) DO UPDATE
SET secret_encrypted=EXCLUDED.secret_encrypted,confirmed_at=EXCLUDED.confirmed_at,
 last_used_step=EXCLUDED.last_used_step,updated_at=now();

-- name: DeleteRecoveryCodes :exec
DELETE FROM identity.admin_recovery_codes WHERE admin_user_id=$1;

-- name: CreateRecoveryCode :exec
INSERT INTO identity.admin_recovery_codes(admin_user_id,code_hash) VALUES($1,$2);

-- name: UseRecoveryCode :exec
UPDATE identity.admin_recovery_codes SET used_at=now()
WHERE admin_user_id=$1 AND code_hash=$2 AND used_at IS NULL;

-- name: InsertAuthEvent :exec
INSERT INTO identity.security_events(admin_user_id,event_type,ip_address)
VALUES(sqlc.narg(admin_user_id)::uuid,$1,sqlc.narg(ip_address)::inet);

-- name: FindSession :one
SELECT data FROM identity.sessions WHERE token=$1 AND expiry>now();

-- name: CommitSession :exec
INSERT INTO identity.sessions(token,data,expiry) VALUES($1,$2,$3)
ON CONFLICT(token) DO UPDATE SET data=EXCLUDED.data,expiry=EXCLUDED.expiry;

-- name: DeleteSession :exec
DELETE FROM identity.sessions WHERE token=$1;

-- name: DeleteExpiredSessions :execrows
DELETE FROM identity.sessions WHERE token IN (
 SELECT token FROM identity.sessions WHERE expiry<=now() ORDER BY expiry LIMIT $1
);
