package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
)

const adminOriginJSON = `(to_jsonb(o)-ARRAY['created_at','updated_at','version'])`
const adminCategoryJSON = `(to_jsonb(c)-ARRAY['created_at','updated_at','version'])`
const adminTypeJSON = `jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name,'attribute_definitions',COALESCE((SELECT jsonb_agg(to_jsonb(d)-ARRAY['id','product_type_id','created_at','updated_at','version'] ORDER BY d.position,d.key) FROM catalog.attribute_definitions d WHERE d.product_type_id=t.id),'[]'::jsonb))`
const adminCategoriesJSON = `COALESCE((SELECT jsonb_agg(` + adminCategoryJSON + ` ORDER BY c.position,c.id) FROM catalog.product_categories pc JOIN catalog.categories c ON c.id=pc.category_id WHERE pc.product_id=p.id),'[]'::jsonb)`
const adminVariantJSON = `(to_jsonb(v)-ARRAY['currency','created_at','updated_at'])||jsonb_build_object('available_quantity',COALESCE((SELECT sum(s.quantity) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=v.id AND l.status='active'),0),'low_stock',false)`

func decodeAdmin(data []byte, out any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	return decoder.Decode(out)
}

func (r *Repository) AdminProduct(ctx context.Context, id string) (domain.AdminProduct, error) {
	return readAdminProduct(ctx, r.pool, id)
}

type adminQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func readAdminProduct(ctx context.Context, db adminQuerier, id string) (domain.AdminProduct, error) {
	var out domain.AdminProduct
	var data []byte
	err := db.QueryRow(ctx, `SELECT jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug,'description',p.description,'status',p.status,'attributes',p.attributes,'created_at',p.created_at,'updated_at',p.updated_at,'version',p.version,
 'product_type',`+adminTypeJSON+`,'origin',`+adminOriginJSON+`,'brand',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id',b.id,'slug',b.slug,'name',b.name,'status',b.status) END,
 'categories',`+adminCategoriesJSON+`,
 'variants',COALESCE((SELECT jsonb_agg(`+adminVariantJSON+` ORDER BY v.position,v.id) FROM catalog.product_variants v WHERE v.product_id=p.id),'[]'::jsonb),
 'images',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'variant_id',i.variant_id,'url',i.storage_key,'alt_text',i.alt_text,'position',i.position,'version',i.version) ORDER BY i.position,i.id) FROM catalog.product_images i WHERE i.product_id=p.id),'[]'::jsonb))
 FROM catalog.products p JOIN catalog.product_types t ON t.id=p.product_type_id LEFT JOIN catalog.origins o ON o.id=p.origin_id LEFT JOIN catalog.brands b ON b.id=p.brand_id WHERE p.id=$1`, id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, &domain.Error{Status: 404, Code: "product_not_found"}
	}
	if err != nil {
		return out, err
	}
	if err := decodeAdmin(data, &out); err != nil {
		return out, err
	}
	out.CreatedAt = out.CreatedAt.UTC()
	out.UpdatedAt = out.UpdatedAt.UTC()
	// The temporary URL slot contains a relative key until application resolution.
	for i := range out.Images {
		out.Images[i].StorageKey = out.Images[i].URL
		out.Images[i].URL = ""
		out.Images[i].ProductVersion = out.Version
	}
	return out, nil
}

const adminProductRows = `WITH source AS (
 SELECT p.id,p.title,p.slug,p.status,p.version,p.product_type_id,
 jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name) AS product_type,
 ` + adminCategoriesJSON + ` AS categories,` + adminOriginJSON + ` AS origin,
 (SELECT i.storage_key FROM catalog.product_images i WHERE i.product_id=p.id ORDER BY i.position,i.id LIMIT 1) AS image_url,
 stats.variant_count,stats.min_price_amount,stats.max_price_amount,COALESCE(stats.available_quantity,0)::bigint AS available_quantity
 FROM catalog.products p JOIN catalog.product_types t ON t.id=p.product_type_id LEFT JOIN catalog.origins o ON o.id=p.origin_id
 CROSS JOIN LATERAL (SELECT count(*) AS variant_count,min(v.price_amount) AS min_price_amount,max(v.price_amount) AS max_price_amount,
 sum((SELECT COALESCE(sum(s.quantity),0) FROM catalog.variant_lot_stock s JOIN catalog.lots l ON l.id=s.lot_id WHERE s.variant_id=v.id AND l.status='active')) AS available_quantity
 FROM catalog.product_variants v WHERE v.product_id=p.id AND v.status='active') stats
 WHERE ($1::text='' OR strpos(lower(p.title),lower($1))>0 OR EXISTS(SELECT 1 FROM catalog.product_variants sv WHERE sv.product_id=p.id AND strpos(lower(sv.sku),lower($1))>0))
 AND (COALESCE(cardinality($2::text[]),0)=0 OR p.status=ANY($2::text[]))
 AND (COALESCE(cardinality($3::uuid[]),0)=0 OR p.product_type_id=ANY($3::uuid[]))
 AND (COALESCE(cardinality($4::uuid[]),0)=0 OR EXISTS(SELECT 1 FROM catalog.product_categories pc WHERE pc.product_id=p.id AND pc.category_id=ANY($4::uuid[])))
 ), filtered AS (SELECT * FROM source WHERE $5::text='all' OR available_quantity<10)
`

func (r *Repository) AdminProducts(ctx context.Context, f domain.AdminReadFilter) (domain.AdminPage[domain.AdminProductRow], error) {
	out := domain.AdminPage[domain.AdminProductRow]{Items: []domain.AdminProductRow{}}
	// Only constants selected by the validated enum enter SQL identifiers/order.
	column, direction, comparison := "lower(title)", "ASC", ">"
	if strings.HasPrefix(f.Sort, "-") {
		direction = "DESC"
		comparison = "<"
	}
	switch strings.TrimPrefix(f.Sort, "-") {
	case "price_amount":
		column = "min_price_amount"
	case "stock":
		column = "available_quantity"
	}
	anchor := `($6::text IS NULL OR (` + column + `,id) ` + comparison + ` ($7::text,$6::uuid))`
	var anchorID *string
	if f.AnchorID != "" {
		anchorID = &f.AnchorID
	}
	args := []any{f.Search, f.Statuses, f.ProductTypes, f.Categories, f.Stock, anchorID, f.AnchorText, f.Limit + 1}
	if column != "lower(title)" {
		anchor = `($6::text IS NULL OR (` + column + `,id) ` + comparison + ` ($7::bigint,$6::uuid))`
		args[6] = f.AnchorNumber
		if column == "min_price_amount" {
			anchor = `($6::text IS NULL OR ($7::bigint IS NULL AND min_price_amount IS NULL AND id ` + comparison + ` $6::uuid) OR ($7::bigint IS NOT NULL AND (min_price_amount IS NULL OR (min_price_amount,id) ` + comparison + ` ($7::bigint,$6::uuid))))`
		}
	}
	rows, err := r.pool.Query(ctx, adminProductRows+`SELECT to_jsonb(x)-'product_type_id',(SELECT count(*) FROM filtered) FROM filtered x WHERE `+anchor+` ORDER BY `+column+` `+direction+` NULLS LAST,id `+direction+` LIMIT $8`, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var data []byte
		var v domain.AdminProductRow
		if err := rows.Scan(&data, &out.Total); err != nil {
			return out, err
		}
		if err := decodeAdmin(data, &v); err != nil {
			return out, err
		}
		v.ImageKey = v.ImageURL
		v.ImageURL = nil
		out.Items = append(out.Items, v)
	}
	if err := rows.Err(); err != nil {
		return out, err
	}
	if len(out.Items) == 0 {
		if err := r.pool.QueryRow(ctx, adminProductRows+`SELECT count(*) FROM filtered`, args[:5]...).Scan(&out.Total); err != nil {
			return out, err
		}
	}
	if len(out.Items) > f.Limit {
		out.Items = out.Items[:f.Limit]
		last := out.Items[len(out.Items)-1]
		n := last.MinPriceAmount
		if column == "available_quantity" {
			n = &last.AvailableQuantity
		}
		c := domain.AdminReadCursor(f, last.ID, strings.ToLower(last.Title), n)
		out.NextCursor = &c
	}
	return out, nil
}
