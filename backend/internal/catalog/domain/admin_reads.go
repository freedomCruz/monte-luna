package domain

import (
	"context"
	"time"
)

func LowStock(quantity int64) bool { return quantity < 10 }
func OldRoast(kind, date string, at time.Time) bool {
	if kind != "coffee" {
		return false
	}
	// Bogota has no DST. Fixed UTC-5 makes calendar decisions independent of
	// host timezone databases (including Windows deployments).
	local := at.In(time.FixedZone("America/Bogota", -5*60*60))
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	produced, err := time.Parse("2006-01-02", date)
	return err == nil && today.Sub(produced) > 30*24*time.Hour
}

type AdminNamed struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}
type AdminBrand struct {
	AdminNamed
	Status string `json:"status"`
}
type AdminCategory struct {
	AdminNamed
	ParentID *string `json:"parent_id"`
	Position int32   `json:"position"`
	Status   string  `json:"status"`
}
type AdminOrigin struct {
	AdminNamed
	ProducerName     string  `json:"producer_name"`
	CountryCode      string  `json:"country_code"`
	Department       *string `json:"department"`
	MunicipalityCode *string `json:"municipality_code"`
	MunicipalityName *string `json:"municipality_name"`
	AltitudeMinMasl  *int32  `json:"altitude_min_masl"`
	AltitudeMaxMasl  *int32  `json:"altitude_max_masl"`
	Story            *string `json:"story"`
	Status           string  `json:"status"`
}
type AdminDefinition struct {
	Key             string   `json:"key"`
	Label           string   `json:"label"`
	DataType        string   `json:"data_type"`
	Scope           string   `json:"scope"`
	IsVariantOption bool     `json:"is_variant_option"`
	IsRequired      bool     `json:"is_required"`
	IsFilterable    bool     `json:"is_filterable"`
	AllowedValues   []Option `json:"allowed_values"`
	Unit            *string  `json:"unit"`
	Position        int32    `json:"position"`
}
type AdminProductType struct {
	AdminNamed
	Definitions []AdminDefinition `json:"attribute_definitions"`
}
type AdminVariant struct {
	ID                   string         `json:"id"`
	ProductID            string         `json:"product_id"`
	SKU                  string         `json:"sku"`
	Barcode              *string        `json:"barcode"`
	Options              map[string]any `json:"options"`
	Attributes           map[string]any `json:"attributes"`
	PriceAmount          int64          `json:"price_amount"`
	CompareAtPriceAmount *int64         `json:"compare_at_price_amount"`
	WeightGrams          int32          `json:"weight_grams"`
	LengthMM             *int32         `json:"length_mm"`
	WidthMM              *int32         `json:"width_mm"`
	HeightMM             *int32         `json:"height_mm"`
	TaxCategory          string         `json:"tax_category"`
	Status               string         `json:"status"`
	Position             int32          `json:"position"`
	AvailableQuantity    int64          `json:"available_quantity"`
	LowStock             bool           `json:"low_stock"`
	Version              int32          `json:"version"`
}
type AdminProduct struct {
	ID          string           `json:"id"`
	ProductType AdminProductType `json:"product_type"`
	Brand       *AdminBrand      `json:"brand"`
	Origin      *AdminOrigin     `json:"origin"`
	Categories  []AdminCategory  `json:"categories"`
	Title       string           `json:"title"`
	Slug        string           `json:"slug"`
	Description *string          `json:"description"`
	Status      string           `json:"status"`
	Attributes  map[string]any   `json:"attributes"`
	Variants    []AdminVariant   `json:"variants"`
	Images      []AdminImage     `json:"images"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
	Version     int32            `json:"version"`
}
type AdminProductRow struct {
	ID                string          `json:"id"`
	Title             string          `json:"title"`
	Slug              string          `json:"slug"`
	ProductType       AdminNamed      `json:"product_type"`
	Categories        []AdminCategory `json:"categories"`
	Origin            *AdminOrigin    `json:"origin"`
	Status            string          `json:"status"`
	VariantCount      int64           `json:"variant_count"`
	MinPriceAmount    *int64          `json:"min_price_amount"`
	MaxPriceAmount    *int64          `json:"max_price_amount"`
	AvailableQuantity int64           `json:"available_quantity"`
	LowStock          bool            `json:"low_stock"`
	ImageURL          *string         `json:"image_url"`
	Version           int32           `json:"version"`
	ImageKey          *string         `json:"-"`
}
type AdminInventoryVariant struct {
	ProductID         string    `json:"product_id"`
	VariantID         string    `json:"variant_id"`
	ProductTitle      string    `json:"product_title"`
	ProductStatus     string    `json:"product_status"`
	VariantStatus     string    `json:"variant_status"`
	VariantLabel      string    `json:"variant_label"`
	SKU               string    `json:"sku"`
	AvailableQuantity int64     `json:"available_quantity"`
	ReservedQuantity  int64     `json:"reserved_quantity"`
	ActiveLotCount    int64     `json:"active_lot_count"`
	LowStock          bool      `json:"low_stock"`
	ProductVersion    int32     `json:"product_version"`
	GeneratedAt       time.Time `json:"generated_at"`
}
type AdminVariantLot struct {
	ID               string  `json:"id"`
	ProductID        string  `json:"product_id"`
	LotCode          string  `json:"lot_code"`
	ProductionDate   string  `json:"production_date"`
	ExpirationDate   *string `json:"expiration_date"`
	Status           string  `json:"status"`
	Quantity         int64   `json:"quantity"`
	ReservedQuantity int64   `json:"reserved_quantity"`
	OldRoast         bool    `json:"old_roast"`
	NextToAllocate   bool    `json:"next_to_allocate"`
	Version          int32   `json:"version"`
}
type AdminMovementOrder struct {
	ID               string `json:"id"`
	OrderNumber      string `json:"order_number"`
	Status           string `json:"status"`
	ReservationState string `json:"reservation_state"`
}
type AdminInventoryMovement struct {
	ID            string              `json:"id"`
	VariantID     string              `json:"variant_id"`
	LotID         string              `json:"lot_id"`
	LotCode       string              `json:"lot_code"`
	QuantityDelta int32               `json:"quantity_delta"`
	Reason        string              `json:"reason"`
	DisplayKind   string              `json:"display_kind"`
	ReferenceID   *string             `json:"reference_id"`
	Order         *AdminMovementOrder `json:"order"`
	ActorID       *string             `json:"actor_id"`
	ActorName     *string             `json:"actor_name"`
	Note          *string             `json:"note"`
	CreatedAt     time.Time           `json:"created_at"`
}
type AdminPage[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
	Total      int64   `json:"total"`
}
type AdminInventoryPage[T any] struct {
	AdminPage[T]
	GeneratedAt time.Time `json:"generated_at"`
}

// AdminReadFilter is validated before any database call. Anchor binds a cursor
// to an endpoint/filter set and carries the last ordered row, never an offset.
type AdminReadFilter struct {
	Kind, ID, ProductID, LotID, Search, Status, Stock, Sort string
	Statuses, Categories, ProductTypes                      []string
	Limit                                                   int
	AnchorID, AnchorText                                    string
	AnchorNumber                                            *int64
	Binding                                                 string
}
type AdminReadRepository interface {
	AdminProducts(context.Context, AdminReadFilter) (AdminPage[AdminProductRow], error)
	AdminProduct(context.Context, string) (AdminProduct, error)
	AdminTaxonomy(context.Context, AdminReadFilter) (AdminTaxonomyRows, error)
	AdminInventory(context.Context, AdminReadFilter) (AdminPage[AdminInventoryVariant], error)
	AdminLots(context.Context, AdminReadFilter) (AdminPage[AdminVariantLot], string, error)
	AdminMovements(context.Context, AdminReadFilter) (AdminPage[AdminInventoryMovement], error)
}
type AdminTaxonomyRows struct {
	Categories   []AdminCategory
	Origins      []AdminOrigin
	Brands       []AdminBrand
	ProductTypes []AdminProductType
	Total        int64
	NextCursor   *string
}
type HeldQuantity struct {
	VariantID, LotID string
	Quantity         int64
}
type AdminOrdersPort interface {
	HeldQuantities(context.Context, []string) ([]HeldQuantity, error)
	MovementOrders(context.Context, []string) (map[string]AdminMovementOrder, error)
}
type AdminNamesPort interface {
	Names(context.Context, []string) (map[string]string, error)
}
