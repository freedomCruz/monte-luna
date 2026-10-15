package postgres

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
)

//go:embed demo/metadata.sql
var demoMetadata string

//go:embed demo/inventory.sql
var demoInventory string

// Seed loads fictional development data in one transaction. Run Migrate first.
// Natural-key conflicts preserve existing records, including prices and stock;
// receipt movements are inserted only for newly initialized positive counters.
func Seed(ctx context.Context, db *sql.DB) (err error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin demo seed: %w", err)
	}
	defer func() {
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			err = errors.Join(err, rollbackErr)
		}
	}()
	if _, err := tx.ExecContext(ctx, demoMetadata); err != nil {
		return fmt.Errorf("seed catalog metadata (run migrate first): %w", err)
	}
	definitions, products := demoData()
	if err := seedDefinitions(ctx, tx, definitions); err != nil {
		return err
	}
	// Validate against definitions actually stored in the database, not merely
	// fixture definitions: a conflicting merchant configuration must fail safely.
	stored, err := loadDefinitions(ctx, tx)
	if err != nil {
		return err
	}
	for _, product := range products {
		if err := seedProduct(ctx, tx, product, stored[product.productType]); err != nil {
			return fmt.Errorf("seed product %s: %w", product.slug, err)
		}
	}
	if _, err := tx.ExecContext(ctx, demoInventory); err != nil {
		return fmt.Errorf("seed catalog inventory and images: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit demo seed: %w", err)
	}
	return nil
}

func seedDefinitions(ctx context.Context, tx *sql.Tx, definitions []demoDefinition) error {
	for position, d := range definitions {
		var allowed any
		if d.allowed != nil {
			encoded, err := json.Marshal(d.allowed)
			if err != nil {
				return fmt.Errorf("encode allowed values for %s: %w", d.key, err)
			}
			allowed = string(encoded)
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO catalog.attribute_definitions
			(product_type_id,key,label,data_type,scope,is_variant_option,is_required,is_filterable,allowed_values,unit,position)
			SELECT id,$2,$3,$4,$5,$6,$7,false,$8,NULLIF($9,''),$10
			FROM catalog.product_types WHERE slug=$1
			ON CONFLICT (product_type_id,key) DO NOTHING`,
			d.productType, d.key, d.label, d.dataType, d.scope, d.scope == "variant", d.required, allowed, d.unit, position)
		if err != nil {
			return fmt.Errorf("seed attribute %s: %w", d.key, err)
		}
	}
	return nil
}

type storedDefinition struct {
	key, dataType, scope      string
	required, isVariantOption bool
	allowed                   []demoOption
}

func loadDefinitions(ctx context.Context, tx *sql.Tx) (result map[string]map[string]storedDefinition, err error) {
	rows, err := tx.QueryContext(ctx, `SELECT t.slug,a.key,a.data_type,a.scope,a.is_required,a.is_variant_option,a.allowed_values
		FROM catalog.attribute_definitions a JOIN catalog.product_types t ON t.id=a.product_type_id
		WHERE t.slug IN ('coffee','cacao')`)
	if err != nil {
		return nil, fmt.Errorf("load demo attribute definitions: %w", err)
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	result = make(map[string]map[string]storedDefinition)
	for rows.Next() {
		var productType string
		var definition storedDefinition
		var allowed []byte
		if err := rows.Scan(&productType, &definition.key, &definition.dataType, &definition.scope,
			&definition.required, &definition.isVariantOption, &allowed); err != nil {
			return nil, fmt.Errorf("read demo definition: %w", err)
		}
		if allowed != nil {
			if err := json.Unmarshal(allowed, &definition.allowed); err != nil {
				return nil, fmt.Errorf("decode allowed values for %s: %w", definition.key, err)
			}
		}
		if result[productType] == nil {
			result[productType] = make(map[string]storedDefinition)
		}
		result[productType][definition.key] = definition
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read demo definitions: %w", err)
	}
	return result, nil
}

func seedProduct(ctx context.Context, tx *sql.Tx, product demoProduct, definitions map[string]storedDefinition) error {
	if err := validateDemoValues(product.attributes, definitions, "product"); err != nil {
		return err
	}
	attributes, err := json.Marshal(product.attributes)
	if err != nil {
		return fmt.Errorf("encode attributes: %w", err)
	}
	var productID string
	// Do not update existing catalog content or prices on a repeated seed.
	_, err = tx.ExecContext(ctx, `INSERT INTO catalog.products
		(product_type_id,brand_id,origin_id,title,slug,description,status,attributes)
		VALUES ((SELECT id FROM catalog.product_types WHERE slug=$1),
		(SELECT id FROM catalog.brands WHERE slug='monteluna'),
		(SELECT id FROM catalog.origins WHERE slug=NULLIF($2,'')),$3,$4,$5,'published',$6)
		ON CONFLICT (slug) DO NOTHING`, product.productType, product.origin, product.title,
		product.slug, product.description, string(attributes))
	if err != nil {
		return fmt.Errorf("insert product: %w", err)
	}
	if err := tx.QueryRowContext(ctx, `SELECT id FROM catalog.products WHERE slug=$1`, product.slug).Scan(&productID); err != nil {
		return fmt.Errorf("read product id: %w", err)
	}
	for _, variant := range product.variants {
		if err := validateDemoValues(variant.options, definitions, "variant"); err != nil {
			return fmt.Errorf("validate variant %s: %w", variant.sku, err)
		}
		if variant.price <= 0 || variant.weight <= 0 || (variant.compareAt != 0 && variant.compareAt <= variant.price) {
			return fmt.Errorf("invalid demo price or weight for %s", variant.sku)
		}
		options, err := json.Marshal(variant.options)
		if err != nil {
			return fmt.Errorf("encode variant options: %w", err)
		}
		var compareAt any
		if variant.compareAt != 0 {
			compareAt = variant.compareAt
		}
		// Excluded is an explicit demo Scenario A setting, not a production
		// classification or a database default. The merchant configures real taxes.
		_, err = tx.ExecContext(ctx, `INSERT INTO catalog.product_variants
			(product_id,sku,options,price_amount,compare_at_price_amount,currency,weight_grams,tax_category,status,position)
			VALUES ($1,$2,$3,$4,$5,'COP',$6,'excluded','active',$7)
			ON CONFLICT (sku) DO NOTHING`, productID, variant.sku, string(options), variant.price, compareAt, variant.weight, variant.position)
		if err != nil {
			return fmt.Errorf("insert variant %s: %w", variant.sku, err)
		}
	}
	return nil
}

func validateDemoValues(values map[string]any, definitions map[string]storedDefinition, scope string) error {
	for key, definition := range definitions {
		if definition.scope == scope && definition.required {
			if value, exists := values[key]; !exists || value == nil {
				return fmt.Errorf("required %s attribute %s is missing", scope, key)
			}
		}
	}
	for key, value := range values {
		definition, exists := definitions[key]
		if !exists || definition.scope != scope || (scope == "variant" && !definition.isVariantOption) {
			return fmt.Errorf("unknown %s attribute or option %s", scope, key)
		}
		if value == nil {
			continue // The required-value check above already rejects required nulls.
		}
		if err := validateDemoValue(value, definition); err != nil {
			return fmt.Errorf("attribute %s: %w", key, err)
		}
	}
	return nil
}

func validateDemoValue(value any, definition storedDefinition) error {
	matches := false
	switch definition.dataType {
	case "text":
		_, matches = value.(string)
	case "integer":
		_, matches = value.(int)
	case "decimal":
		_, matches = value.(float64)
	case "boolean":
		_, matches = value.(bool)
	case "option":
		text, ok := value.(string)
		matches = ok && containsDemoOption(definition.allowed, text)
	case "multi_option":
		texts, ok := value.([]string)
		matches = ok
		for _, text := range texts {
			matches = matches && containsDemoOption(definition.allowed, text)
		}
	}
	if !matches {
		return fmt.Errorf("value does not match %s definition or allowed values", definition.dataType)
	}
	return nil
}

func containsDemoOption(options []demoOption, value string) bool {
	for _, option := range options {
		if option.Value == value {
			return true
		}
	}
	return false
}
