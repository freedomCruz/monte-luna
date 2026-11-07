package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"

	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func adminWriteError(err error) error {
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		if pg.Code == "23505" {
			code := ""
			switch pg.ConstraintName {
			case "products_slug_key":
				code = "slug_conflict"
			case "product_variants_sku_key":
				code = "sku_conflict"
			case "product_variants_product_id_options_key":
				code = "variant_options_conflict"
			}
			if code != "" {
				return &domain.Error{Status: 409, Code: code}
			}
		}
		if pg.Code == "23503" || pg.Code == "23514" || pg.Code == "22003" {
			return domain.AdminInvalid("body")
		}
	}
	return err
}

// WriteAdmin serializes all content edits through the same product lock and
// conditional bump used by image attachment. Responses are read before commit.
func (r *Repository) WriteAdmin(ctx context.Context, in domain.AdminWrite) (out domain.AdminWriteResult, err error) {
	if err = domain.ValidateAdminWrite(in); err != nil {
		return out, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return out, err
	}
	defer rollback(ctx, tx, &err)
	defer func() { err = adminWriteError(err) }()
	if in.Kind == "create-product" {
		out, err = createAdminProduct(ctx, tx, in)
	} else {
		q := catalogsql.New(tx)
		if in.Kind == "receipt" {
			err = tx.QueryRow(ctx, `SELECT product_id::text FROM catalog.product_variants WHERE id=$1`, in.VariantID).Scan(&in.ProductID)
			if errors.Is(err, pgx.ErrNoRows) {
				return out, &domain.Error{Status: 404, Code: "variant_not_found"}
			}
			if err != nil {
				return out, err
			}
		}
		var version int32
		version, err = q.LockImageProduct(ctx, in.ProductID)
		if err = imageVersion(version, err, in.Version); err != nil {
			return out, err
		}
		switch in.Kind {
		case "update-product":
			out, err = updateAdminProduct(ctx, tx, in)
		case "create-variant", "update-variant":
			out, err = writeAdminVariant(ctx, tx, in)
		case "receipt":
			out, err = receiveAdminLot(ctx, tx, in)
		default:
			err = domain.AdminInvalid("operation")
		}
		if err == nil {
			var changed int64
			changed, err = q.BumpImageProduct(ctx, catalogsql.BumpImageProductParams{ID: in.ProductID, Version: in.Version})
			if err == nil && changed != 1 {
				err = &domain.Error{Status: 412, Code: "version_conflict"}
			}
			out.ProductVersion = in.Version + 1
		}
	}
	if err != nil {
		return out, err
	}
	if out.Product != nil {
		p, e := readAdminProduct(ctx, tx, out.Product.ID)
		if e != nil {
			return out, e
		}
		out.Product = &p
		out.ProductVersion = p.Version
	}
	err = tx.Commit(ctx)
	return out, err
}
func decodeFields(fields map[string]json.RawMessage, out any) error {
	data, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	d.DisallowUnknownFields()
	if err = d.Decode(out); err != nil {
		return domain.AdminInvalid("body")
	}
	return nil
}
func attributePatch(fields map[string]json.RawMessage, key string, base map[string]any) (map[string]any, error) {
	raw, ok := fields[key]
	if !ok {
		return base, nil
	}
	var patch map[string]any
	if err := decodeAdmin(raw, &patch); err != nil || patch == nil {
		return nil, domain.AdminInvalid(key)
	}
	return domain.MergeAdminAttributes(base, patch), nil
}

type productInput struct {
	ProductTypeID string         `json:"product_type_id"`
	Title         string         `json:"title"`
	Slug          string         `json:"slug"`
	Description   *string        `json:"description"`
	Status        string         `json:"status"`
	BrandID       *string        `json:"brand_id"`
	OriginID      *string        `json:"origin_id"`
	CategoryIDs   []string       `json:"category_ids"`
	Attributes    map[string]any `json:"attributes"`
	Images        []imageEdit    `json:"images"`
}
type imageEdit struct {
	ID        string  `json:"id"`
	AltText   string  `json:"alt_text"`
	VariantID *string `json:"variant_id"`
	Position  int32   `json:"position"`
}

func readProductType(ctx context.Context, tx pgx.Tx, id string) (domain.AdminProductType, error) {
	var out domain.AdminProductType
	var raw []byte
	err := tx.QueryRow(ctx, `SELECT `+adminTypeJSON+` FROM catalog.product_types t WHERE t.id=$1`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, domain.AdminInvalid("product_type_id")
	}
	if err != nil {
		return out, err
	}
	err = decodeAdmin(raw, &out)
	return out, err
}
func referenceActive(ctx context.Context, tx pgx.Tx, table string, id *string, old *string) error {
	if id == nil {
		return nil
	}
	if !domain.ValidAdminID(*id) {
		return domain.AdminInvalid(table)
	}
	var status string
	err := tx.QueryRow(ctx, `SELECT status FROM catalog.`+table+` WHERE id=$1 FOR SHARE`, *id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminInvalid(table)
	}
	if err != nil {
		return err
	}
	if status != "active" && (old == nil || *id != *old) {
		return domain.AdminInvalid(table)
	}
	return nil
}
func productReferences(ctx context.Context, tx pgx.Tx, in productInput, old domain.AdminProduct) error {
	var brand, origin *string
	if old.Brand != nil {
		brand = &old.Brand.ID
	}
	if old.Origin != nil {
		origin = &old.Origin.ID
	}
	if err := referenceActive(ctx, tx, "brands", in.BrandID, brand); err != nil {
		return err
	}
	return referenceActive(ctx, tx, "origins", in.OriginID, origin)
}
func createAdminProduct(ctx context.Context, tx pgx.Tx, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	var out domain.AdminWriteResult
	p := productInput{Status: "draft", CategoryIDs: []string{}}
	if err := decodeFields(in.Fields, &p); err != nil {
		return out, err
	}
	if !domain.ValidAdminID(p.ProductTypeID) {
		return out, domain.AdminInvalid("product_type_id")
	}
	typ, err := readProductType(ctx, tx, p.ProductTypeID)
	if err != nil {
		return out, err
	}
	if err := domain.ValidateAdminProduct(domain.AdminProduct{Title: p.Title, Slug: p.Slug, Status: p.Status, Attributes: p.Attributes, ProductType: typ}); err != nil {
		return out, err
	}
	if err := productReferences(ctx, tx, p, domain.AdminProduct{}); err != nil {
		return out, err
	}
	attributes, err := json.Marshal(p.Attributes)
	if err != nil {
		return out, err
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO catalog.products(product_type_id,title,slug,description,status,brand_id,origin_id,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`, p.ProductTypeID, p.Title, p.Slug, p.Description, p.Status, p.BrandID, p.OriginID, attributes).Scan(&id)
	if err != nil {
		return out, err
	}
	if err = replaceCategories(ctx, tx, id, p.CategoryIDs, nil); err != nil {
		return out, err
	}
	out.Product = &domain.AdminProduct{ID: id}
	return out, nil
}
func updateAdminProduct(ctx context.Context, tx pgx.Tx, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	var out domain.AdminWriteResult
	old, err := readAdminProduct(ctx, tx, in.ProductID)
	if err != nil {
		return out, err
	}
	p := productInput{Title: old.Title, Slug: old.Slug, Description: old.Description, Status: old.Status, Attributes: old.Attributes}
	if old.Brand != nil {
		p.BrandID = &old.Brand.ID
	}
	if old.Origin != nil {
		p.OriginID = &old.Origin.ID
	}
	if err = decodeFields(in.Fields, &p); err != nil {
		return out, err
	}
	p.Attributes, err = attributePatch(in.Fields, "attributes", old.Attributes)
	if err != nil {
		return out, err
	}
	if err = domain.ValidateAdminProduct(domain.AdminProduct{Title: p.Title, Slug: p.Slug, Status: p.Status, Attributes: p.Attributes, ProductType: old.ProductType}); err != nil {
		return out, err
	}
	if err = productReferences(ctx, tx, p, old); err != nil {
		return out, err
	}
	if _, ok := in.Fields["category_ids"]; ok {
		if err = replaceCategories(ctx, tx, in.ProductID, p.CategoryIDs, old.Categories); err != nil {
			return out, err
		}
	}
	if _, ok := in.Fields["images"]; ok {
		if err = replaceImages(ctx, tx, in.ProductID, p.Images, old.Images); err != nil {
			return out, err
		}
	}
	attrs, err := json.Marshal(p.Attributes)
	if err != nil {
		return out, err
	}
	_, err = tx.Exec(ctx, `UPDATE catalog.products SET title=$2,slug=$3,description=$4,status=$5,brand_id=$6,origin_id=$7,attributes=$8 WHERE id=$1 AND version=$9`, in.ProductID, p.Title, p.Slug, p.Description, p.Status, p.BrandID, p.OriginID, attrs, in.Version)
	out.Product = &domain.AdminProduct{ID: in.ProductID}
	return out, err
}
func replaceCategories(ctx context.Context, tx pgx.Tx, id string, ids []string, old []domain.AdminCategory) error {
	seen := map[string]bool{}
	for _, category := range ids {
		if seen[category] {
			return domain.AdminInvalid("category_ids")
		}
		seen[category] = true
		var previous *string
		for _, c := range old {
			if c.ID == category {
				previous = &category
				break
			}
		}
		if err := referenceActive(ctx, tx, "categories", &category, previous); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM catalog.product_categories WHERE product_id=$1`, id); err != nil {
		return err
	}
	for _, category := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO catalog.product_categories(product_id,category_id) VALUES($1,$2)`, id, category); err != nil {
			return err
		}
	}
	return nil
}
func replaceImages(ctx context.Context, tx pgx.Tx, id string, images []imageEdit, old []domain.AdminImage) error {
	seen := map[string]bool{}
	for _, image := range images {
		var previous *domain.AdminImage
		for i := range old {
			if old[i].ID == image.ID {
				previous = &old[i]
				break
			}
		}
		if previous == nil || seen[image.ID] || strings.TrimSpace(image.AltText) == "" {
			return domain.AdminInvalid("images")
		}
		seen[image.ID] = true
		if image.VariantID != nil {
			if !domain.ValidAdminID(*image.VariantID) {
				return domain.AdminInvalid("images.variant_id")
			}
			var belongs bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog.product_variants WHERE id=$1 AND product_id=$2)`, *image.VariantID, id).Scan(&belongs); err != nil {
				return err
			}
			if !belongs {
				return domain.AdminInvalid("images.variant_id")
			}
		}
		sameVariant := previous.VariantID == nil && image.VariantID == nil || previous.VariantID != nil && image.VariantID != nil && *previous.VariantID == *image.VariantID
		if image.AltText == previous.AltText && image.Position == previous.Position && sameVariant {
			continue
		}
		tag, err := tx.Exec(ctx, `UPDATE catalog.product_images SET alt_text=$3,variant_id=$4,position=$5,updated_at=now(),version=version+1 WHERE id=$1 AND product_id=$2 AND version=$6`, image.ID, id, image.AltText, image.VariantID, image.Position, previous.Version)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return &domain.Error{Status: 412, Code: "version_conflict"}
		}
	}
	for _, image := range old {
		if !seen[image.ID] {
			if _, err := tx.Exec(ctx, `DELETE FROM catalog.product_images WHERE id=$1 AND product_id=$2`, image.ID, id); err != nil {
				return err
			}
		}
	}
	return nil
}
func writeAdminVariant(ctx context.Context, tx pgx.Tx, in domain.AdminWrite) (domain.AdminWriteResult, error) {
	var out domain.AdminWriteResult
	p, err := readAdminProduct(ctx, tx, in.ProductID)
	if err != nil {
		return out, err
	}
	v := domain.AdminVariant{ProductID: in.ProductID, Status: "active", Options: map[string]any{}, Attributes: map[string]any{}}
	if in.Kind == "update-variant" {
		found := false
		for _, item := range p.Variants {
			if item.ID == in.VariantID {
				v = item
				found = true
				break
			}
		}
		if !found {
			return out, &domain.Error{Status: 404, Code: "variant_not_found"}
		}
	}
	oldOptions, oldAttributes := v.Options, v.Attributes
	// Decode into a dedicated input: read-only response fields are never writable.
	data, _ := json.Marshal(in.Fields)
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err = decoder.Decode(&v); err != nil {
		return out, domain.AdminInvalid("body")
	}
	if in.Kind == "update-variant" {
		v.Options, err = attributePatch(in.Fields, "options", oldOptions)
		if err != nil {
			return out, err
		}
		v.Attributes, err = attributePatch(in.Fields, "attributes", oldAttributes)
		if err != nil {
			return out, err
		}
	}
	if err = domain.ValidateAdminVariant(v, p.ProductType.Definitions); err != nil {
		return out, err
	}
	options, err := json.Marshal(v.Options)
	if err != nil {
		return out, err
	}
	attrs, err := json.Marshal(v.Attributes)
	if err != nil {
		return out, err
	}
	args := []any{in.ProductID, v.SKU, v.Barcode, options, attrs, v.PriceAmount, v.CompareAtPriceAmount, v.WeightGrams, v.LengthMM, v.WidthMM, v.HeightMM, v.TaxCategory, v.Status, v.Position}
	if in.Kind == "create-variant" {
		err = tx.QueryRow(ctx, `INSERT INTO catalog.product_variants(product_id,sku,barcode,options,attributes,price_amount,compare_at_price_amount,weight_grams,length_mm,width_mm,height_mm,tax_category,status,position,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'COP') RETURNING id::text,version`, args...).Scan(&v.ID, &v.Version)
	} else {
		args = append(args, v.ID, v.Version)
		var version int32
		err = tx.QueryRow(ctx, `UPDATE catalog.product_variants SET sku=$2,barcode=$3,options=$4,attributes=$5,price_amount=$6,compare_at_price_amount=$7,weight_grams=$8,length_mm=$9,width_mm=$10,height_mm=$11,tax_category=$12,status=$13,position=$14,version=version+1,updated_at=now() WHERE product_id=$1 AND id=$15 AND version=$16 RETURNING version`, args...).Scan(&version)
		if errors.Is(err, pgx.ErrNoRows) {
			return out, &domain.Error{Status: 412, Code: "version_conflict"}
		}
		v.Version = version
	}
	if err != nil {
		return out, err
	}
	out.Variant = &v
	return out, nil
}
