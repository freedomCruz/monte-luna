-- name: CountAdmins :one
SELECT count(*) FROM identity.admin_users;

-- name: UpdateManagedAdmin :one
UPDATE identity.admin_users SET email=$2,display_name=$3,role=$4,status=$5,
 password_hash=$6,password_changed_at=$7,session_version=$8,
 failed_login_attempts=$9,locked_until=$10,last_login_at=$11,
 version=version+1,updated_at=now()
WHERE id=$1 AND version=$12 RETURNING *;

-- name: ListManagedAdmins :many
SELECT sqlc.embed(u),t.confirmed_at AS totp_confirmed_at
FROM identity.admin_users u
LEFT JOIN identity.admin_totp_credentials t ON t.admin_user_id=u.id
WHERE (sqlc.narg(after_id)::uuid IS NULL OR u.id>sqlc.narg(after_id)::uuid)
ORDER BY u.id LIMIT sqlc.arg(page_limit);

-- name: DeleteTOTP :exec
DELETE FROM identity.admin_totp_credentials WHERE admin_user_id=$1;

-- name: InsertIdentityTokenEvent :exec
INSERT INTO identity.outbox(type,payload,occurred_at,created_at,updated_at,available_at)
VALUES($1,$2,$3,$3,$3,$3);

-- name: InsertSecurityEvent :exec
INSERT INTO identity.security_events(admin_user_id,event_type,ip_address,user_agent,metadata,created_at)
VALUES(sqlc.narg(admin_user_id)::uuid,$1,sqlc.narg(ip_address)::inet,sqlc.narg(user_agent)::text,$2,coalesce(sqlc.narg(event_time)::timestamptz,now()));

-- name: DeleteOldSecurityEvents :execrows
DELETE FROM identity.security_events WHERE id IN (
 SELECT id FROM identity.security_events
 WHERE created_at < (sqlc.arg(reference_time)::timestamptz - interval '1 year')
 ORDER BY created_at,id LIMIT sqlc.arg(batch_size)
);
