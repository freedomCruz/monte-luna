package app

import (
	"context"
	"github.com/freedomCruz/monte-luna/backend/internal/catalog/domain"
	"time"
)

type AdminReads struct {
	repo   domain.AdminReadRepository
	media  domain.MediaResolverPort
	orders domain.AdminOrdersPort
	names  domain.AdminNamesPort
	now    func() time.Time
}

func NewAdminReads(repo domain.AdminReadRepository, media domain.MediaResolverPort, orders domain.AdminOrdersPort, names domain.AdminNamesPort, now func() time.Time) *AdminReads {
	return &AdminReads{repo, media, orders, names, now}
}
func (s *AdminReads) Products(ctx context.Context, f domain.AdminReadFilter) (domain.AdminPage[domain.AdminProductRow], error) {
	out, err := s.repo.AdminProducts(ctx, f)
	if err != nil {
		return out, err
	}
	for i := range out.Items {
		v := &out.Items[i]
		v.LowStock = domain.LowStock(v.AvailableQuantity)
		if v.ImageKey != nil {
			url, err := s.media.Resolve(ctx, *v.ImageKey)
			if err != nil {
				return out, err
			}
			v.ImageURL = &url
		}
	}
	return out, nil
}
func (s *AdminReads) Product(ctx context.Context, id string) (domain.AdminProduct, error) {
	out, err := s.repo.AdminProduct(ctx, id)
	if err != nil {
		return out, err
	}
	for i := range out.Variants {
		out.Variants[i].LowStock = domain.LowStock(out.Variants[i].AvailableQuantity)
	}
	for i := range out.Images {
		url, err := s.media.Resolve(ctx, out.Images[i].StorageKey)
		if err != nil {
			return out, err
		}
		out.Images[i].URL = url
	}
	return out, nil
}
func (s *AdminReads) Taxonomy(ctx context.Context, f domain.AdminReadFilter) (any, error) {
	out, err := s.repo.AdminTaxonomy(ctx, f)
	if err != nil {
		return nil, err
	}
	switch f.Kind {
	case "categories":
		return domain.AdminPage[domain.AdminCategory]{Items: out.Categories, NextCursor: out.NextCursor, Total: out.Total}, nil
	case "origins":
		return domain.AdminPage[domain.AdminOrigin]{Items: out.Origins, NextCursor: out.NextCursor, Total: out.Total}, nil
	case "brands":
		return domain.AdminPage[domain.AdminBrand]{Items: out.Brands, NextCursor: out.NextCursor, Total: out.Total}, nil
	default:
		return domain.AdminPage[domain.AdminProductType]{Items: out.ProductTypes, NextCursor: out.NextCursor, Total: out.Total}, nil
	}
}
func dependencyError() error { return &domain.Error{Status: 503, Code: "dependency_unavailable"} }
func (s *AdminReads) Inventory(ctx context.Context, f domain.AdminReadFilter) (domain.AdminInventoryPage[domain.AdminInventoryVariant], error) {
	out := domain.AdminInventoryPage[domain.AdminInventoryVariant]{GeneratedAt: s.now().UTC()}
	page, err := s.repo.AdminInventory(ctx, f)
	out.AdminPage = page
	if err != nil {
		return out, err
	}
	ids := make([]string, 0, len(page.Items))
	for _, v := range page.Items {
		ids = append(ids, v.VariantID)
	}
	held, err := s.orders.HeldQuantities(ctx, ids)
	if err != nil {
		return out, dependencyError()
	}
	counts := map[string]int64{}
	for _, v := range held {
		counts[v.VariantID] += v.Quantity
	}
	for i := range out.Items {
		v := &out.Items[i]
		v.ReservedQuantity = counts[v.VariantID]
		v.LowStock = domain.LowStock(v.AvailableQuantity)
		v.GeneratedAt = out.GeneratedAt
	}
	return out, nil
}
func (s *AdminReads) Lots(ctx context.Context, f domain.AdminReadFilter) (domain.AdminInventoryPage[domain.AdminVariantLot], error) {
	out := domain.AdminInventoryPage[domain.AdminVariantLot]{GeneratedAt: s.now().UTC()}
	page, kind, err := s.repo.AdminLots(ctx, f)
	out.AdminPage = page
	if err != nil {
		return out, err
	}
	held, err := s.orders.HeldQuantities(ctx, []string{f.ID})
	if err != nil {
		return out, dependencyError()
	}
	counts := map[string]int64{}
	for _, v := range held {
		if v.VariantID == f.ID {
			counts[v.LotID] += v.Quantity
		}
	}
	for i := range out.Items {
		v := &out.Items[i]
		v.ReservedQuantity = counts[v.ID]
		v.OldRoast = domain.OldRoast(kind, v.ProductionDate, out.GeneratedAt)
	}
	return out, nil
}
func uniquePointers(values []*string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		if v != nil && !seen[*v] {
			seen[*v] = true
			out = append(out, *v)
		}
	}
	return out
}
func (s *AdminReads) Movements(ctx context.Context, f domain.AdminReadFilter) (domain.AdminInventoryPage[domain.AdminInventoryMovement], error) {
	out := domain.AdminInventoryPage[domain.AdminInventoryMovement]{GeneratedAt: s.now().UTC()}
	page, err := s.repo.AdminMovements(ctx, f)
	out.AdminPage = page
	if err != nil {
		return out, err
	}
	refs, actors := []*string{}, []*string{}
	for _, v := range page.Items {
		refs = append(refs, v.ReferenceID)
		actors = append(actors, v.ActorID)
	}
	orders, err := s.orders.MovementOrders(ctx, uniquePointers(refs))
	if err != nil {
		return out, dependencyError()
	}
	names, err := s.names.Names(ctx, uniquePointers(actors))
	if err != nil {
		return out, dependencyError()
	}
	for i := range out.Items {
		v := &out.Items[i]
		v.DisplayKind = v.Reason
		if v.ReferenceID != nil {
			if order, ok := orders[*v.ReferenceID]; ok {
				v.Order = &order
			}
		}
		if v.Reason == "sale" {
			v.DisplayKind = "allocation"
			if v.Order != nil {
				switch v.Order.ReservationState {
				case "held":
					v.DisplayKind = "reservation"
				case "committed":
					v.DisplayKind = "sale"
				}
			}
		}
		if v.ActorID != nil {
			if name, ok := names[*v.ActorID]; ok {
				v.ActorName = &name
			}
		}
	}
	return out, nil
}
