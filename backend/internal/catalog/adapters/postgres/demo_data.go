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
		{"coffee", "species", "Especie", "option", "product", "", true, []demoOption{{"arabica", "Arábica"}}},
		{"coffee", "varieties", "Variedades", "multi_option", "product", "", false, []demoOption{{"geisha", "Geisha"}, {"bourbon", "Bourbon"}, {"castillo", "Castillo"}}},
		{"coffee", "process", "Proceso", "option", "product", "", true, []demoOption{{"washed", "Lavado"}, {"natural", "Natural"}, {"honey", "Honey"}}},
		{"coffee", "roast_level", "Tostión", "option", "product", "", true, []demoOption{{"light", "Clara"}, {"medium", "Media"}, {"dark", "Oscura"}}},
		{"coffee", "tasting_notes", "Notas de cata", "text", "product", "", false, nil},
		{"coffee", "cupping_score", "Puntaje de cata", "decimal", "product", "", false, nil},
		{"coffee", "cupping_protocol", "Protocolo de evaluación", "option", "product", "", false, []demoOption{{"sca", "SCA (evaluación demo)"}}},
		{"coffee", "presentation", "Presentación", "option", "variant", "g", true, []demoOption{{"250_g", "250"}, {"500_g", "500"}}},
		{"coffee", "grind", "Molienda", "option", "variant", "", true, []demoOption{{"whole_bean", "Grano entero"}, {"fine", "Fina"}, {"medium", "Media"}, {"coarse", "Gruesa"}}},
		{"cacao", "genetic_group", "Grupo genético", "option", "product", "", false, []demoOption{{"criollo", "Criollo"}, {"trinitario", "Trinitario"}, {"forastero", "Forastero"}}},
		{"cacao", "fermentation", "Fermentación", "text", "product", "", false, nil},
		{"cacao", "drying", "Secado", "text", "product", "", false, nil},
		{"cacao", "product_form", "Forma del producto", "option", "product", "", true, []demoOption{{"beans", "Granos"}, {"nibs", "Nibs"}, {"paste", "Pasta"}, {"table_chocolate", "Chocolate de mesa"}, {"bar", "Barra"}}},
		{"cacao", "cacao_percentage", "Cacao", "integer", "product", "%", false, nil},
		{"cacao", "fine_or_flavour", "Fino o de aroma (declaración del comerciante)", "boolean", "product", "", false, nil},
		{"cacao", "presentation", "Presentación", "option", "variant", "g", true, []demoOption{{"80_g", "80"}}},
	}
	mirador := demoProduct{
		slug: "finca-el-mirador", title: "Finca El Mirador", productType: "coffee", origin: "finca-el-mirador",
		description: "Café lavado demo con tostión media fija y existencias independientes por presentación y molienda.",
		attributes:  map[string]any{"species": "arabica", "varieties": []string{"geisha", "bourbon"}, "process": "washed", "roast_level": "medium", "tasting_notes": "Cítricos, panela y chocolate (demo)", "cupping_score": 88.5, "cupping_protocol": "sca"},
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
		description: "Segundo café demo que comparte el origen de café reutilizable.",
		attributes:  map[string]any{"species": "arabica", "varieties": []string{"castillo"}, "process": "natural", "roast_level": "light", "tasting_notes": "Frutos rojos (demo)", "cupping_score": nil, "cupping_protocol": nil},
		variants:    []demoVariant{{sku: "MARIA-250-WHOLE_BEAN", weight: 250, price: 4200000, options: map[string]any{"presentation": "250_g", "grind": "whole_bean"}}},
	}
	chocolate := demoProduct{
		slug: "chocolate-70", title: "Chocolate 70%", productType: "cacao", origin: "demo-cacao-origin",
		description: "Barra de cacao demo; los datos de origen se mantienen separados de los atributos del producto de cacao.",
		attributes:  map[string]any{"genetic_group": "trinitario", "fermentation": "Seis días (demo)", "drying": "Secado al sol (demo)", "product_form": "bar", "cacao_percentage": 70, "fine_or_flavour": true},
		variants:    []demoVariant{{sku: "CHOCOLATE-70-80", weight: 80, price: 1400000, options: map[string]any{"presentation": "80_g"}}},
	}
	noOrigin := demoProduct{
		slug: "chocolate-85", title: "Chocolate 85%", productType: "cacao",
		description: "Producto demo de marca comercial sin origen agrícola; no se muestra enlace de origen.",
		attributes:  map[string]any{"genetic_group": nil, "fermentation": nil, "drying": nil, "product_form": "bar", "cacao_percentage": 85, "fine_or_flavour": false},
		variants:    []demoVariant{{sku: "CHOCOLATE-85-80", weight: 80, price: 1600000, options: map[string]any{"presentation": "80_g"}}},
	}
	return definitions, []demoProduct{mirador, maria, chocolate, noOrigin}
}
