package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	catalogsql "github.com/freedomCruz/monte-luna/backend/internal/catalog/adapters/postgres/sqlc"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
func object(data []byte) (map[string]any, error) {
	var result map[string]any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&result); err != nil {
		return nil, fmt.Errorf("decode catalog attributes: %w", err)
	}
	return result, nil
}
func rollback(ctx context.Context, tx pgx.Tx, err *error) {
	if e := tx.Rollback(ctx); e != nil && !errors.Is(e, pgx.ErrTxClosed) {
		*err = errors.Join(*err, e)
	}
}

// Stable product composition uses batched queries in one read-only snapshot,
// rather than one query per product/card/variant.
func (r *Repository) Products(ctx context.Context, q domain.Query) (result []domain.Product, err error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin catalog read: %w", err)
	}
	defer rollback(ctx, tx, &err)
	db := catalogsql.New(tx)
	arg := catalogsql.ReadProductsParams{ProductTypes: q.ProductTypes, Categories: q.Categories, AfterSlug: q.After.Slug, PageLimit: int32(q.Limit)}
	if q.Kind == domain.ProductDetail {
		arg.ProductSlug = q.Slug
	}
	if q.Kind == domain.OriginProducts {
		arg.OriginSlug = q.Slug
	}
	if q.After.CreatedAt != nil {
		arg.AfterCreatedAt = pgtype.Timestamptz{Time: *q.After.CreatedAt, Valid: true}
	}
	rows, err := db.ReadProducts(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("read published products: %w", err)
	}
	result = make([]domain.Product, 0, len(rows))
	ids := make([]string, 0, len(rows))
	typeIDs := make([]string, 0, len(rows))
	indices := map[string]int{}
	for _, row := range rows {
		values, err := object(row.Attributes)
		if err != nil {
			return nil, err
		}
		p := domain.Product{Slug: row.Slug, Title: row.Title, Description: row.Description, CreatedAt: row.CreatedAt.Time.UTC(), ProductType: domain.NamedResource{Slug: row.TypeSlug, Name: row.TypeName}, Values: values, Categories: make([]domain.Category, 0), Images: make([]domain.ProductImage, 0), Variants: make([]domain.Variant, 0)}
		if row.BrandSlug != "" {
			p.Brand = &domain.NamedResource{Slug: row.BrandSlug, Name: row.BrandName}
		}
		if row.OriginSlug != "" {
			p.Origin = &domain.OriginSummary{Slug: row.OriginSlug, Name: row.OriginName, ProducerName: row.ProducerName}
		}
		indices[row.ID] = len(result)
		ids = append(ids, row.ID)
		typeIDs = append(typeIDs, row.ProductTypeID)
		result = append(result, p)
	}
	if len(rows) == 0 {
		return result, nil
	}
	categories, err := db.ReadProductCategories(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("read product categories: %w", err)
	}
	for _, row := range categories {
		p := &result[indices[row.ProductID]]
		p.Categories = append(p.Categories, domain.Category{Slug: row.Slug, Name: row.Name, Position: row.Position, ParentSlug: nullable(row.ParentSlug)})
	}
	images, err := db.ReadProductImages(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("read product images: %w", err)
	}
	for _, row := range images {
		p := &result[indices[row.ProductID]]
		p.Images = append(p.Images, domain.ProductImage{Image: domain.Image{StorageKey: row.StorageKey, AltText: row.AltText}, VariantID: nullable(row.VariantID)})
	}
	definitions, err := db.ReadDefinitions(ctx, typeIDs)
	if err != nil {
		return nil, fmt.Errorf("read attribute definitions: %w", err)
	}
	byType := map[string][]domain.Definition{}
	for _, row := range definitions {
		d := domain.Definition{Key: row.Key, Label: row.Label, DataType: row.DataType, Scope: row.Scope, Unit: row.Unit, IsVariantOption: row.IsVariantOption}
		if len(row.AllowedValues) > 0 {
			if err := json.Unmarshal(row.AllowedValues, &d.Allowed); err != nil {
				return nil, fmt.Errorf("decode attribute options: %w", err)
			}
		}
		byType[row.ProductTypeID] = append(byType[row.ProductTypeID], d)
	}
	for i, row := range rows {
		result[i].Definitions = byType[row.ProductTypeID]
	}
	variants, err := db.ReadVariants(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("read active variants: %w", err)
	}
	for _, row := range variants {
		values, err := object(row.Options)
		if err != nil {
			return nil, err
		}
		p := &result[indices[row.ProductID]]
		p.Variants = append(p.Variants, domain.Variant{ID: row.ID, SKU: row.Sku, WeightGrams: row.WeightGrams, Values: values})
	}
	return result, nil
}
func (r *Repository) Origins(ctx context.Context, q domain.Query) (result []domain.Origin, err error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin origin read: %w", err)
	}
	defer rollback(ctx, tx, &err)
	db := catalogsql.New(tx)
	arg := catalogsql.ReadOriginsParams{AfterName: q.After.Name, AfterSlug: q.After.Slug, PageLimit: int32(q.Limit)}
	if q.Kind == domain.OriginDetail {
		arg.OriginSlug = q.Slug
	}
	rows, err := db.ReadOrigins(ctx, arg)
	if err != nil {
		return nil, fmt.Errorf("read active origins: %w", err)
	}
	result = make([]domain.Origin, 0, len(rows))
	ids := make([]string, 0, len(rows))
	indices := map[string]int{}
	for _, row := range rows {
		indices[row.ID] = len(result)
		ids = append(ids, row.ID)
		result = append(result, domain.Origin{Slug: row.Slug, Name: row.Name, ProducerName: row.ProducerName, CountryCode: row.CountryCode, Department: row.Department, MunicipalityCode: row.MunicipalityCode, MunicipalityName: row.MunicipalityName, AltitudeMinMasl: row.AltitudeMinMasl, AltitudeMaxMasl: row.AltitudeMaxMasl, Story: row.Story, Images: make([]domain.Image, 0)})
	}
	if len(ids) == 0 {
		return result, nil
	}
	images, err := db.ReadOriginImages(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("read origin images: %w", err)
	}
	for _, row := range images {
		o := &result[indices[row.OriginID]]
		o.Images = append(o.Images, domain.Image{StorageKey: row.StorageKey, AltText: row.AltText})
	}
	return result, nil
}
func (r *Repository) Categories(ctx context.Context, q domain.Query) ([]domain.Category, error) {
	rows, err := catalogsql.New(r.pool).ReadCategories(ctx, catalogsql.ReadCategoriesParams{AfterPosition: q.After.Position, AfterSlug: q.After.Slug, PageLimit: int32(q.Limit)})
	if err != nil {
		return nil, fmt.Errorf("read active categories: %w", err)
	}
	result := make([]domain.Category, 0, len(rows))
	for _, row := range rows {
		result = append(result, domain.Category{Slug: row.Slug, Name: row.Name, ParentSlug: nullable(row.ParentSlug), Position: row.Position})
	}
	return result, nil
}
func (r *Repository) OriginExists(ctx context.Context, slug string) (bool, error) {
	exists, err := catalogsql.New(r.pool).ActiveOriginExists(ctx, slug)
	if err != nil {
		return false, fmt.Errorf("read active origin: %w", err)
	}
	return exists, nil
}

// Live uses exactly one SQL statement: prices, stock, and oldest positive active
// lot dates for all requested products share the same database snapshot.
func (r *Repository) Live(ctx context.Context, q domain.Query) ([]domain.ProductAvailability, error) {
	rows, err := catalogsql.New(r.pool).ReadLive(ctx, catalogsql.ReadLiveParams{ProductSlugs: q.ProductSlugs, AfterSlug: q.After.Slug, PageLimit: int32(q.Limit)})
	if err != nil {
		return nil, fmt.Errorf("read live catalog: %w", err)
	}
	result := make([]domain.ProductAvailability, 0)
	for _, row := range rows {
		if len(result) == 0 || result[len(result)-1].ProductSlug != row.Slug {
			result = append(result, domain.ProductAvailability{ProductSlug: row.Slug, Variants: make([]domain.VariantAvailability, 0)})
		}
		if row.VariantID == "" {
			continue
		}
		var date *string
		if row.ProductionDate.Valid {
			value := row.ProductionDate.Time.Format("2006-01-02")
			date = &value
		}
		availability, date := domain.Availability(row.Quantity, date)
		p := &result[len(result)-1]
		p.Variants = append(p.Variants, domain.VariantAvailability{VariantID: row.VariantID, PriceAmount: row.PriceAmount, CompareAtPriceAmount: row.CompareAtPriceAmount, Availability: availability, ProductionDate: date})
	}
	return result, nil
}
