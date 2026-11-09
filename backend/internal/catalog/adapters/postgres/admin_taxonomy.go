package postgres

import (
	"context"
	"encoding/json"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
)

func (r *Repository) AdminTaxonomy(ctx context.Context, f domain.AdminReadFilter) (domain.AdminTaxonomyRows, error) {
	out := domain.AdminTaxonomyRows{Categories: []domain.AdminCategory{}, Origins: []domain.AdminOrigin{}, Brands: []domain.AdminBrand{}, ProductTypes: []domain.AdminProductType{}}
	source := `SELECT t.id,t.name,` + adminTypeJSON + ` AS item FROM catalog.product_types t`
	key := "name"
	switch f.Kind {
	case "categories":
		source = `SELECT c.id,c.name,c.position,` + adminCategoryJSON + ` AS item FROM catalog.categories c WHERE ($1::text='all' OR c.status=$1) AND $2::text=''`
		key = "position"
	case "origins":
		source = `SELECT o.id,o.name,` + adminOriginJSON + ` AS item FROM catalog.origins o WHERE ($1::text='all' OR o.status=$1) AND ($2::text='' OR strpos(lower(o.name),lower($2))>0 OR strpos(lower(o.producer_name),lower($2))>0)`
	case "brands":
		source = `SELECT b.id,b.name,jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'status',b.status) AS item FROM catalog.brands b WHERE ($1::text='all' OR b.status=$1) AND $2::text=''`
	default:
		source += ` WHERE $1::text='' AND $2::text=''`
	}
	var id *string
	if f.AnchorID != "" {
		id = &f.AnchorID
	}
	var anchor any = f.AnchorText
	cast := "text"
	if key == "position" {
		anchor = f.AnchorNumber
		cast = "bigint"
	}
	query := `WITH source AS (` + source + `), page AS (SELECT * FROM source WHERE ($3::text IS NULL OR (` + key + `,id)>($4::` + cast + `,$3::uuid)) ORDER BY ` + key + `,id LIMIT $5) SELECT COALESCE(jsonb_agg(item ORDER BY ` + key + `,id),'[]'::jsonb),(SELECT count(*) FROM source) FROM page`
	var data []byte
	if err := r.pool.QueryRow(ctx, query, f.Status, f.Search, id, anchor, f.Limit+1).Scan(&data, &out.Total); err != nil {
		return out, err
	}
	// Decode only the known taxonomy type; the response never leaks table columns.
	switch f.Kind {
	case "categories":
		if err := decodeAdmin(data, &out.Categories); err != nil {
			return out, err
		}
		if len(out.Categories) > f.Limit {
			out.Categories = out.Categories[:f.Limit]
			last := out.Categories[f.Limit-1]
			n := int64(last.Position)
			c := domain.AdminReadCursor(f, last.ID, last.Name, &n)
			out.NextCursor = &c
		}
	case "origins":
		if err := decodeAdmin(data, &out.Origins); err != nil {
			return out, err
		}
		if len(out.Origins) > f.Limit {
			out.Origins = out.Origins[:f.Limit]
			last := out.Origins[f.Limit-1]
			c := domain.AdminReadCursor(f, last.ID, last.Name, nil)
			out.NextCursor = &c
		}
	case "brands":
		if err := decodeAdmin(data, &out.Brands); err != nil {
			return out, err
		}
		if len(out.Brands) > f.Limit {
			out.Brands = out.Brands[:f.Limit]
			last := out.Brands[f.Limit-1]
			c := domain.AdminReadCursor(f, last.ID, last.Name, nil)
			out.NextCursor = &c
		}
	default:
		if err := json.Unmarshal(data, &out.ProductTypes); err != nil {
			return out, err
		}
		if len(out.ProductTypes) > f.Limit {
			out.ProductTypes = out.ProductTypes[:f.Limit]
			last := out.ProductTypes[f.Limit-1]
			c := domain.AdminReadCursor(f, last.ID, last.Name, nil)
			out.NextCursor = &c
		}
	}
	return out, nil
}
