-- name: ReadProducts :many
SELECT p.id, p.product_type_id, p.slug, p.title, p.description, p.created_at, p.attributes,
  t.slug AS type_slug, t.name AS type_name,
  COALESCE(b.slug,'')::text AS brand_slug, COALESCE(b.name,'')::text AS brand_name,
  COALESCE(o.slug,'')::text AS origin_slug, COALESCE(o.name,'')::text AS origin_name,
  COALESCE(o.producer_name,'')::text AS producer_name
FROM catalog.products p
JOIN catalog.product_types t ON t.id=p.product_type_id
LEFT JOIN catalog.brands b ON b.id=p.brand_id AND b.status='active'
LEFT JOIN catalog.origins o ON o.id=p.origin_id AND o.status='active'
WHERE p.status='published'
  AND (sqlc.arg(product_slug)::text='' OR p.slug=sqlc.arg(product_slug))
  AND (sqlc.arg(origin_slug)::text='' OR o.slug=sqlc.arg(origin_slug))
  AND (COALESCE(cardinality(sqlc.arg(product_types)::text[]),0)=0 OR t.slug=ANY(sqlc.arg(product_types)::text[]))
  AND (COALESCE(cardinality(sqlc.arg(categories)::text[]),0)=0 OR EXISTS (
    SELECT 1 FROM catalog.product_categories pc JOIN catalog.categories c ON c.id=pc.category_id
    WHERE pc.product_id=p.id AND c.status='active' AND c.slug=ANY(sqlc.arg(categories)::text[])))
  AND (sqlc.narg(after_created_at)::timestamptz IS NULL OR p.created_at<sqlc.narg(after_created_at)
    OR (p.created_at=sqlc.narg(after_created_at) AND p.slug>sqlc.arg(after_slug)::text))
ORDER BY p.created_at DESC,p.slug ASC
LIMIT sqlc.arg(page_limit)::integer;

-- name: ReadProductCategories :many
SELECT pc.product_id,c.slug,c.name,c.position,COALESCE(parent.slug,'')::text AS parent_slug
FROM catalog.product_categories pc JOIN catalog.categories c ON c.id=pc.category_id AND c.status='active'
LEFT JOIN catalog.categories parent ON parent.id=c.parent_id AND parent.status='active'
WHERE pc.product_id=ANY(sqlc.arg(product_ids)::uuid[])
ORDER BY c.position,c.slug;

-- name: ReadProductImages :many
SELECT i.product_id,i.storage_key,i.alt_text,COALESCE(i.variant_id::text,'')::text AS variant_id
FROM catalog.product_images i
LEFT JOIN catalog.product_variants v ON v.id=i.variant_id
WHERE i.product_id=ANY(sqlc.arg(product_ids)::uuid[]) AND (i.variant_id IS NULL OR v.status='active')
ORDER BY i.position,i.id;

-- name: ReadDefinitions :many
SELECT product_type_id,key,label,data_type,scope,is_variant_option,unit,allowed_values
FROM catalog.attribute_definitions
WHERE product_type_id=ANY(sqlc.arg(type_ids)::uuid[])
ORDER BY position,key;

-- name: ReadVariants :many
SELECT id,product_id,sku,weight_grams,options
FROM catalog.product_variants
WHERE product_id=ANY(sqlc.arg(product_ids)::uuid[]) AND status='active'
ORDER BY position,id;

-- name: ReadOrigins :many
SELECT o.id,o.slug,o.name,o.producer_name,o.country_code,o.department,o.municipality_code,
  o.municipality_name,o.altitude_min_masl,o.altitude_max_masl,o.story
FROM catalog.origins o
WHERE o.status='active' AND (sqlc.arg(origin_slug)::text='' OR o.slug=sqlc.arg(origin_slug))
  AND (sqlc.narg(after_name)::text IS NULL OR o.name>sqlc.narg(after_name)
    OR (o.name=sqlc.narg(after_name) AND o.slug>sqlc.arg(after_slug)::text))
ORDER BY o.name,o.slug
LIMIT sqlc.arg(page_limit)::integer;

-- name: ReadOriginImages :many
SELECT origin_id,storage_key,alt_text FROM catalog.origin_images
WHERE origin_id=ANY(sqlc.arg(origin_ids)::uuid[])
ORDER BY position,id;

-- name: ReadCategories :many
SELECT c.slug,c.name,c.position,COALESCE(parent.slug,'')::text AS parent_slug
FROM catalog.categories c
LEFT JOIN catalog.categories parent ON parent.id=c.parent_id AND parent.status='active'
WHERE c.status='active'
  AND (sqlc.narg(after_position)::integer IS NULL OR c.position>sqlc.narg(after_position)
    OR (c.position=sqlc.narg(after_position) AND c.slug>sqlc.arg(after_slug)::text))
ORDER BY c.position,c.slug
LIMIT sqlc.arg(page_limit)::integer;

-- name: ActiveOriginExists :one
SELECT EXISTS(SELECT 1 FROM catalog.origins WHERE slug=$1 AND status='active');

-- name: ReadLive :many
WITH product_page AS (
  SELECT p.id,p.slug FROM catalog.products p
  WHERE p.status='published' AND p.slug=ANY(sqlc.arg(product_slugs)::text[])
    AND p.slug>sqlc.arg(after_slug)::text
  ORDER BY p.slug LIMIT sqlc.arg(page_limit)::integer
)
SELECT p.slug,COALESCE(v.id::text,'')::text AS variant_id,
  COALESCE(v.price_amount,0)::bigint AS price_amount,v.compare_at_price_amount,
  COALESCE(stock.quantity,0)::bigint AS quantity,stock.production_date
FROM product_page p
LEFT JOIN catalog.product_variants v ON v.product_id=p.id AND v.status='active'
LEFT JOIN LATERAL (
  SELECT sum(s.quantity)::bigint AS quantity,
    min(CASE WHEN s.quantity>0 THEN l.production_date END)::date AS production_date
  FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id AND l.status='active'
  WHERE s.variant_id=v.id
) stock ON true
ORDER BY p.slug,v.position,v.id;
