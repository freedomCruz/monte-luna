package postgres

import "strings"

type demoOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type demoDefinition struct {
	productType, key, label, dataType, scope, unit string
	required                                       bool
	allowed                                        []demoOption
}

type demoVariant struct {
	sku              string
	weight, position int
	price, compareAt int64
	options          map[string]any
}

type demoProduct struct {
	slug, title, productType, origin, description string
	attributes                                    map[string]any
	variants                                      []demoVariant
}

// All names, agronomic details, and assessments here are fictional demo content.
// Prices follow the approved design placeholders, not production pricing.
func demoData() ([]demoDefinition, []demoProduct) {
	definitions := []demoDefinition{
		{"coffee", "species", "Species", "option", "product", "", true, []demoOption{{"arabica", "Arabica"}}},
		{"coffee", "varieties", "Varieties", "multi_option", "product", "", false, []demoOption{{"geisha", "Geisha"}, {"bourbon", "Bourbon"}, {"castillo", "Castillo"}}},
		{"coffee", "process", "Process", "option", "product", "", true, []demoOption{{"washed", "Washed"}, {"natural", "Natural"}, {"honey", "Honey"}}},
		{"coffee", "roast_level", "Roast level", "option", "product", "", true, []demoOption{{"light", "Light"}, {"medium", "Medium"}, {"dark", "Dark"}}},
		{"coffee", "tasting_notes", "Tasting notes", "text", "product", "", false, nil},
		{"coffee", "cupping_score", "Cupping score", "decimal", "product", "", false, nil},
		{"coffee", "cupping_protocol", "Assessment protocol", "option", "product", "", false, []demoOption{{"sca", "SCA (demo assessment)"}}},
		{"coffee", "presentation", "Presentation", "option", "variant", "g", true, []demoOption{{"250_g", "250"}, {"500_g", "500"}}},
		{"coffee", "grind", "Grind", "option", "variant", "", true, []demoOption{{"whole_bean", "Whole bean"}, {"fine", "Fine"}, {"medium", "Medium"}, {"coarse", "Coarse"}}},
		{"cacao", "genetic_group", "Genetic group", "option", "product", "", false, []demoOption{{"criollo", "Criollo"}, {"trinitario", "Trinitario"}, {"forastero", "Forastero"}}},
		{"cacao", "fermentation", "Fermentation", "text", "product", "", false, nil},
		{"cacao", "drying", "Drying", "text", "product", "", false, nil},
		{"cacao", "product_form", "Product form", "option", "product", "", true, []demoOption{{"beans", "Beans"}, {"nibs", "Nibs"}, {"paste", "Paste"}, {"table_chocolate", "Table chocolate"}, {"bar", "Bar"}}},
		{"cacao", "cacao_percentage", "Cacao", "integer", "product", "%", false, nil},
		{"cacao", "fine_or_flavour", "Fine or flavour (merchant declaration)", "boolean", "product", "", false, nil},
		{"cacao", "presentation", "Presentation", "option", "variant", "g", true, []demoOption{{"80_g", "80"}}},
	}
	mirador := demoProduct{
		slug: "finca-el-mirador", title: "Finca El Mirador", productType: "coffee", origin: "finca-el-mirador",
		description: "Demo washed coffee with a fixed medium roast and independent stock per presentation and grind.",
		attributes:  map[string]any{"species": "arabica", "varieties": []string{"geisha", "bourbon"}, "process": "washed", "roast_level": "medium", "tasting_notes": "Citrus, panela and chocolate (demo)", "cupping_score": 88.5, "cupping_protocol": "sca"},
	}
	for _, weight := range []int{250, 500} {
		presentation, skuWeight := "250_g", "250"
		price, compareAt := int64(3800000), int64(4500000)
		if weight == 500 {
			presentation, skuWeight = "500_g", "500"
			price, compareAt = 7600000, 9000000 // Demo extrapolation for the larger bag.
		}
		for _, grind := range []string{"whole_bean", "fine", "medium", "coarse"} {
			mirador.variants = append(mirador.variants, demoVariant{
				sku: "MIRADOR-" + skuWeight + "-" + strings.ToUpper(grind), weight: weight,
				position: len(mirador.variants), price: price, compareAt: compareAt,
				options: map[string]any{"presentation": presentation, "grind": grind},
			})
		}
	}
	maria := demoProduct{
		slug: "finca-la-maria", title: "Finca La María", productType: "coffee", origin: "finca-el-mirador",
		description: "Second demo coffee sharing the reusable coffee origin.",
		attributes:  map[string]any{"species": "arabica", "varieties": []string{"castillo"}, "process": "natural", "roast_level": "light", "tasting_notes": "Red fruit (demo)", "cupping_score": nil, "cupping_protocol": nil},
		variants:    []demoVariant{{sku: "MARIA-250-WHOLE_BEAN", weight: 250, price: 4200000, options: map[string]any{"presentation": "250_g", "grind": "whole_bean"}}},
	}
	chocolate := demoProduct{
		slug: "chocolate-70", title: "Chocolate 70%", productType: "cacao", origin: "demo-cacao-origin",
		description: "Demo cacao bar; origin facts stay separate from cacao product attributes.",
		attributes:  map[string]any{"genetic_group": "trinitario", "fermentation": "Six days (demo)", "drying": "Sun-dried (demo)", "product_form": "bar", "cacao_percentage": 70, "fine_or_flavour": true},
		variants:    []demoVariant{{sku: "CHOCOLATE-70-80", weight: 80, price: 1400000, options: map[string]any{"presentation": "80_g"}}},
	}
	noOrigin := demoProduct{
		slug: "chocolate-85", title: "Chocolate 85%", productType: "cacao",
		description: "Demo commercial-brand product without an agricultural origin; no origin link is shown.",
		attributes:  map[string]any{"genetic_group": nil, "fermentation": nil, "drying": nil, "product_form": "bar", "cacao_percentage": 85, "fine_or_flavour": false},
		variants:    []demoVariant{{sku: "CHOCOLATE-85-80", weight: 80, price: 1600000, options: map[string]any{"presentation": "80_g"}}},
	}
	return definitions, []demoProduct{mirador, maria, chocolate, noOrigin}
}
