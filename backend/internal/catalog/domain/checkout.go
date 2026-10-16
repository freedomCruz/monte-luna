package domain

import "strings"

// CheckoutVariant is an in-process live read model, never a persisted order.
type CheckoutVariant struct {
	ID, ProductID, ProductSlug, ProductTitle, VariantLabel, SKU string
	PriceAmount                                                 int64
	Currency                                                    string
	ProductStatus, Status                                       string
	WeightGrams                                                 int32
	TaxCategory                                                 string
	AvailableStock                                              int64
}

func VariantLabel(definitions []Definition, values map[string]any) (string, error) {
	attributes, err := DisplayAttributes(definitions, values, "variant")
	if err != nil {
		return "", err
	}
	labels := make([]string, 0, len(attributes))
	for _, attribute := range attributes {
		if attribute.DisplayValue != nil {
			label := *attribute.DisplayValue
			if attribute.Unit != nil {
				label += " " + *attribute.Unit
			}
			labels = append(labels, label)
		}
	}
	return strings.Join(labels, " / "), nil
}
