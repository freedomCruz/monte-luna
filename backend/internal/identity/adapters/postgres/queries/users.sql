-- name: CreateAdmin :one
INSERT INTO identity.admin_users (email,display_name,role,status,password_hash)
VALUES ($1,$2,$3,$4,$5) RETURNING *;

-- name: GetAdmin :one
SELECT * FROM identity.admin_users WHERE id=$1;

-- name: GetAdminForUpdate :one
SELECT * FROM identity.admin_users WHERE id=$1 FOR UPDATE;

-- name: FindAdminByEmail :one
SELECT * FROM identity.admin_users WHERE email=$1;

-- name: ListAdmins :many
SELECT * FROM identity.admin_users
WHERE (sqlc.narg(after_id)::uuid IS NULL OR id > sqlc.narg(after_id)::uuid)
ORDER BY id LIMIT sqlc.arg(page_limit);

-- name: CountActiveOwners :one
SELECT count(*) FROM identity.admin_users WHERE role='owner' AND status='active';

-- name: UpdateAdmin :one
UPDATE identity.admin_users SET email=$2,display_name=$3,role=$4,status=$5,
    version=version+1,session_version=$6,updated_at=now()
WHERE id=$1 AND version=$7 RETURNING *;
