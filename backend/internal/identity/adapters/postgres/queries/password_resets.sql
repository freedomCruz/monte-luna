-- name: InvalidatePasswordTokens :exec
UPDATE identity.password_reset_tokens SET used_at=$2
WHERE admin_user_id=$1 AND used_at IS NULL;

-- name: CreatePasswordToken :exec
INSERT INTO identity.password_reset_tokens(admin_user_id,token_hash,created_at,expires_at)
VALUES ($1,$2,$3,$4);

-- name: InsertPasswordResetEvent :exec
INSERT INTO identity.outbox(type,payload,occurred_at,created_at,updated_at,available_at)
VALUES ('identity.password_reset_requested',$1,$2,$2,$2,$2);

-- name: PasswordResetAccount :one
SELECT u.email FROM identity.password_reset_tokens t
JOIN identity.admin_users u ON u.id=t.admin_user_id
WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>$2 AND u.status='active';

-- name: FindPasswordToken :one
SELECT * FROM identity.password_reset_tokens WHERE token_hash=$1;

-- name: LockPasswordToken :one
SELECT * FROM identity.password_reset_tokens WHERE token_hash=$1 FOR UPDATE;

-- name: SetResetPassword :exec
UPDATE identity.admin_users SET password_hash=$2,password_changed_at=$3,
    session_version=session_version+1,version=version+1,updated_at=$3
WHERE id=$1;

-- name: DeleteOldPasswordTokens :execrows
DELETE FROM identity.password_reset_tokens WHERE id IN (
 SELECT id FROM identity.password_reset_tokens
 WHERE coalesce(used_at,expires_at) < (sqlc.arg(reference_time)::timestamptz - interval '7 days')
 ORDER BY coalesce(used_at,expires_at),id LIMIT sqlc.arg(batch_size)
);
