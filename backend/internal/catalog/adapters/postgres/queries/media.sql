-- name: ImageProductVersion :one
SELECT version FROM catalog.products WHERE id = $1;

-- name: LockImageProduct :one
SELECT version FROM catalog.products WHERE id = $1 FOR UPDATE;

-- name: ImageVariantBelongs :one
SELECT EXISTS(SELECT 1 FROM catalog.product_variants WHERE id = $1 AND product_id = $2);

-- name: ReserveImageUpload :exec
INSERT INTO catalog.media_uploads (id, storage_key) VALUES ($1, $2);

-- name: LockImageUpload :one
SELECT storage_key FROM catalog.media_uploads WHERE id = $1 FOR UPDATE;

-- name: RemoveImageUpload :exec
DELETE FROM catalog.media_uploads WHERE id = $1;

-- name: BumpImageProduct :execrows
UPDATE catalog.products SET version = version + 1, updated_at = now()
WHERE id = $1 AND version = $2;

-- name: InsertAdminImage :one
INSERT INTO catalog.product_images (id, product_id, variant_id, storage_key, alt_text, position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, product_id, variant_id, storage_key, alt_text, position, version;

-- name: ReadAdminImage :one
SELECT i.id, i.product_id, i.variant_id, i.storage_key, i.alt_text, i.position, i.version,
  p.version AS product_version
FROM catalog.product_images i JOIN catalog.products p ON p.id = i.product_id
WHERE i.id = $1 AND i.product_id = $2;
