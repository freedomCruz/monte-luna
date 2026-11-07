package postgres

import (
	"context"
	"errors"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

func adminAnchor(id string) *string {
	if id == "" {
		return nil
	}
	return &id
}

const adminInventorySource = `WITH source AS (
 SELECT p.id AS product_id,v.id AS variant_id,p.title AS product_title,p.status AS product_status,v.status AS variant_status,v.sku,v.position,p.version AS product_version,
 COALESCE((SELECT string_agg(CASE WHEN d.data_type='multi_option' THEN
 (SELECT string_agg(COALESCE((SELECT a->>'label' FROM jsonb_array_elements(d.allowed_values) a WHERE a->>'value'=choice.value),choice.value),', ' ORDER BY choice.ordinality)
 FROM jsonb_array_elements_text(v.options->d.key) WITH ORDINALITY choice(value,ordinality))
 ELSE COALESCE((SELECT a->>'label' FROM jsonb_array_elements(d.allowed_values) a WHERE a->>'value'=v.options->>d.key),v.options->>d.key) END,' / ' ORDER BY d.position,d.key)
 FROM catalog.attribute_definitions d WHERE d.product_type_id=p.product_type_id AND d.scope='variant' AND d.is_variant_option),'') AS variant_label,
 COALESCE((SELECT sum(s.quantity) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=v.id AND l.status='active'),0)::bigint AS available_quantity,
 (SELECT count(*) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=v.id AND l.status='active' AND s.quantity>0) AS active_lot_count
 FROM catalog.product_variants v JOIN catalog.products p ON p.id=v.product_id
 WHERE ($1::text='' OR strpos(lower(p.title),lower($1))>0 OR strpos(lower(v.sku),lower($1))>0)
 AND ($2::text='' OR p.id=NULLIF($2,'')::uuid) AND ($3::text='all' OR v.status=$3)
 AND ($4::text='' OR v.id=NULLIF($4,'')::uuid)
 ),filtered AS (SELECT * FROM source WHERE $5::text='all' OR available_quantity<10)
`

func (r *Repository) AdminInventory(ctx context.Context, f domain.AdminReadFilter) (domain.AdminPage[domain.AdminInventoryVariant], error) {
	out := domain.AdminPage[domain.AdminInventoryVariant]{Items: []domain.AdminInventoryVariant{}}
	status := f.Status
	if status == "" {
		status = "all"
	}
	rows, err := r.pool.Query(ctx, adminInventorySource+`SELECT to_jsonb(x),(SELECT count(*) FROM filtered) FROM filtered x WHERE ($6::text IS NULL OR (product_title,position,variant_id)>($7::text,$8::bigint,$6::uuid)) ORDER BY product_title,position,variant_id LIMIT $9`, f.Search, f.ProductID, status, f.ID, f.Stock, adminAnchor(f.AnchorID), f.AnchorText, f.AnchorNumber, f.Limit+1)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	var positions []int64
	for rows.Next() {
		var data []byte
		var v domain.AdminInventoryVariant
		if err := rows.Scan(&data, &out.Total); err != nil {
			return out, err
		}
		if err := decodeAdmin(data, &v); err != nil {
			return out, err
		}
		var key struct {
			Position int64 `json:"position"`
		}
		if err := decodeAdmin(data, &key); err != nil {
			return out, err
		}
		positions = append(positions, key.Position)
		out.Items = append(out.Items, v)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(out.Items) == 0 {
		if f.ID != "" {
			return out, &domain.Error{Status: 404, Code: "variant_not_found"}
		}
		if err := r.pool.QueryRow(ctx, adminInventorySource+`SELECT count(*) FROM filtered`, f.Search, f.ProductID, status, f.ID, f.Stock).Scan(&out.Total); err != nil {
			return out, err
		}
	}
	if len(out.Items) > f.Limit {
		out.Items = out.Items[:f.Limit]
		v := out.Items[f.Limit-1]
		c := domain.AdminReadCursor(f, v.VariantID, v.ProductTitle, &positions[f.Limit-1])
		out.NextCursor = &c
	}
	return out, nil
}
func (r *Repository) variantType(ctx context.Context, id string) (string, error) {
	var kind string
	err := r.pool.QueryRow(ctx, `SELECT t.slug FROM catalog.product_variants v JOIN catalog.products p ON p.id=v.product_id JOIN catalog.product_types t ON t.id=p.product_type_id WHERE v.id=$1`, id).Scan(&kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", &domain.Error{Status: 404, Code: "variant_not_found"}
	}
	return kind, err
}
func (r *Repository) AdminLots(ctx context.Context, f domain.AdminReadFilter) (domain.AdminPage[domain.AdminVariantLot], string, error) {
	out := domain.AdminPage[domain.AdminVariantLot]{Items: []domain.AdminVariantLot{}}
	kind, err := r.variantType(ctx, f.ID)
	if err != nil {
		return out, kind, err
	}
	const source = `WITH source AS (SELECT l.id,l.product_id,l.lot_code,to_char(l.production_date,'YYYY-MM-DD') AS production_date,to_char(l.expiration_date,'YYYY-MM-DD') AS expiration_date,l.status,s.quantity,l.version,
 l.id=(SELECT nl.id FROM catalog.variant_lot_stock ns JOIN catalog.lots nl ON nl.id=ns.lot_id WHERE ns.variant_id=$1 AND nl.status='active' AND ns.quantity>0 ORDER BY nl.production_date,nl.id LIMIT 1) AS next_to_allocate
 FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=$1)`
	rows, err := r.pool.Query(ctx, source+` SELECT to_jsonb(x),(SELECT count(*) FROM source) FROM source x WHERE ($2::text IS NULL OR (production_date,id)>($3::text,$2::uuid)) ORDER BY production_date,id LIMIT $4`, f.ID, adminAnchor(f.AnchorID), f.AnchorText, f.Limit+1)
	if err != nil {
		return out, kind, err
	}
	defer rows.Close()
	for rows.Next() {
		var data []byte
		var v domain.AdminVariantLot
		if err := rows.Scan(&data, &out.Total); err != nil {
			return out, kind, err
		}
		if err := decodeAdmin(data, &v); err != nil {
			return out, kind, err
		}
		out.Items = append(out.Items, v)
	}
	if err := rows.Err(); err != nil {
		return out, kind, err
	}
	if len(out.Items) == 0 {
		if err := r.pool.QueryRow(ctx, source+` SELECT count(*) FROM source`, f.ID).Scan(&out.Total); err != nil {
			return out, kind, err
		}
	}
	if len(out.Items) > f.Limit {
		out.Items = out.Items[:f.Limit]
		v := out.Items[f.Limit-1]
		c := domain.AdminReadCursor(f, v.ID, v.ProductionDate, nil)
		out.NextCursor = &c
	}
	return out, kind, nil
}
func (r *Repository) AdminMovements(ctx context.Context, f domain.AdminReadFilter) (domain.AdminPage[domain.AdminInventoryMovement], error) {
	out := domain.AdminPage[domain.AdminInventoryMovement]{Items: []domain.AdminInventoryMovement{}}
	if _, err := r.variantType(ctx, f.ID); err != nil {
		return out, err
	}
	const source = `WITH source AS (SELECT m.*,l.lot_code FROM catalog.inventory_movements m JOIN catalog.lots l ON l.id=m.lot_id WHERE m.variant_id=$1 AND ($2::text='' OR m.lot_id=NULLIF($2,'')::uuid))`
	rows, err := r.pool.Query(ctx, source+` SELECT to_jsonb(x),(SELECT count(*) FROM source) FROM source x WHERE ($3::text IS NULL OR (created_at,id)<(NULLIF($4::text,'')::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`, f.ID, f.LotID, adminAnchor(f.AnchorID), f.AnchorText, f.Limit+1)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var data []byte
		var v domain.AdminInventoryMovement
		if err := rows.Scan(&data, &out.Total); err != nil {
			return out, err
		}
		if err := decodeAdmin(data, &v); err != nil {
			return out, err
		}
		v.CreatedAt = v.CreatedAt.UTC()
		out.Items = append(out.Items, v)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(out.Items) == 0 {
		if err := r.pool.QueryRow(ctx, source+` SELECT count(*) FROM source`, f.ID, f.LotID).Scan(&out.Total); err != nil {
			return out, err
		}
	}
	if len(out.Items) > f.Limit {
		out.Items = out.Items[:f.Limit]
		v := out.Items[f.Limit-1]
		c := domain.AdminReadCursor(f, v.ID, v.CreatedAt.Format("2006-01-02T15:04:05.999999999Z07:00"), nil)
		out.NextCursor = &c
	}
	return out, nil
}
