# Invoicing and Taxes

Canonical design for tax calculation, fiscal documents, and withholdings. It extends [data-modeling.md](data-modeling.md) and the `internal/invoicing` and `internal/payments` modules described in [system-architecture.md](system-architecture.md).

> **Not tax advice.** This document defines what the software must support. Each merchant decides their legal form, tax regime, and invoicing obligations with an accountant, and configures the platform accordingly.

## 1. Status

| Item | Status |
|---|---|
| Separation of tax calculation, fiscal document issuance, and fiscal data | Approved |
| Merchant fiscal profile as configuration | Approved |
| Tax category per variant, assigned by the merchant | Approved |
| Tax rates, tax units (UVT), and thresholds as dated data | Approved |
| Withholdings recorded in payment settlement reconciliation, never in checkout or invoices | Approved |
| Demo default: Scenario A (natural person not responsible for VAT) | Approved |
| Invoicing provider: Factus, **sandbox integration only** | Approved |
| Production fiscal document issuance (Factus production package) | Pending (depends on the merchant's invoicing obligation) |
| No VAT charged for now (Scenario A) | Approved |
| Tax-inclusive pricing policy for VAT-responsible merchants | Not applicable under Scenario A; decide if a merchant becomes VAT-responsible |
| Single currency: COP | Approved |

## 2. Three Separate Responsibilities

| Responsibility | When | Mechanism |
|---|---|---|
| **Tax calculation** | Cart and checkout, before payment | `TaxCalculator` port, synchronous |
| **Fiscal document issuance** | After payment | `InvoiceIssuer` port, triggered by `OrderPaid` through the outbox |
| **Fiscal data** | Buyer data at checkout; merchant data in configuration | Country-specific schemas validated in Go |

```go
type TaxCalculator interface {
    Calculate(ctx context.Context, req TaxRequest) (TaxResult, error)
}

type InvoiceIssuer interface {
    Country() string
    Issue(ctx context.Context, inv Invoice) (IssueResult, error)
    IssueCreditNote(ctx context.Context, note CreditNote) (IssueResult, error)
}
```

- An issuance failure never blocks or reverts a sale. The invoice stays `pending`, `failed`, or `rejected`, is visible in the admin panel, and is retried.
- **Official numbering belongs to the adapter.** A technology provider assigns numbers from the DIAN-authorized range; an own-software adapter allocates them itself with a row-locked counter (never a PostgreSQL sequence, which can leave gaps).
- Issued fiscal documents are immutable. Corrections and refunds use credit notes.

## 3. Merchant Fiscal Profile (Configuration)

| Field | Example values | Effect |
|---|---|---|
| `country` | `CO` | Selects country adapters and dated data |
| `legal_form` | `natural_person`, `company` | Informational; used by country rules and fiscal documents |
| `tax_regime` | `ordinary`, `simple` | Informational; affects withholding expectations |
| `vat_responsible` | `true`, `false` | **If `false`, no line is charged VAT**, and invoice lines are sent as excluded |

**Demo default (Scenario A):** `country = CO`, `legal_form = natural_person`, `vat_responsible = false`.

The profile values in force at the time of sale are copied into the order snapshot, so later profile changes never alter past orders.

## 4. Tax Categories per Variant

Each variant stores a generic `tax_category`: `excluded`, `exempt`, `reduced`, or `standard`. The country adapter maps each category to a tax code and rate from dated data.

Colombian reference examples (the merchant confirms each product's tariff classification with an accountant):

| Product | Treatment | Source |
|---|---|---|
| Unroasted green coffee beans, husk (09.01.11) | Excluded | Estatuto Tributario art. 424 |
| Raw cacao beans (18.01.00.19.00) | Excluded | Estatuto Tributario art. 424 |
| Coffee, including roasted or decaffeinated (09.01, except 09.01.11) | 5% | Estatuto Tributario art. 468-1 |
| Coffee extracts and concentrates (21.01.11) | 5% | Estatuto Tributario art. 468-1 |
| Table chocolate (18.06.32.00.90) | 5% | Estatuto Tributario art. 468-1 |
| Goods without special treatment | 19% (general rate) | Estatuto Tributario art. 468 |

## 5. Dated Fiscal Data

Stored in the `invoicing` schema. Law changes are handled by inserting rows, not by deploying code.

| Table | Content | Example |
|---|---|---|
| `tax_rates` | Country, tax category, tax code, rate in basis points, validity range | `CO`, `reduced`, VAT, `500`, from 2017-01-01 |
| `tax_units` | Country, unit, year, value | `CO`, `UVT`, 2026, `52374` |
| `fiscal_thresholds` | Country, rule, amount in tax units | `CO`, VAT non-responsibility, `3500` UVT |

**Optional admin warning:** for merchants with `vat_responsible = false`, the panel warns when the year's gross sales approach the VAT non-responsibility threshold, so the merchant consults their accountant in time. The platform only informs; it never changes the merchant's tax status on its own.

## 6. Order Tax Snapshot

Captured at checkout and never recalculated:

- Per line: tax category, tax code, rate, taxable base, and tax amount.
- Order totals: base, taxes, and total, with currency.
- Merchant fiscal profile values in force (`vat_responsible`, regime).
- Buyer fiscal data as entered (document type and number, natural or legal person, name or company name, email, municipality code).

Fiscal documents are always built from this snapshot.

## 7. Withholdings (Payments Module)

Withholdings are tax prepayments of the **merchant**. They are deducted by payment intermediaries when paying out to the merchant. They are **never charged to the buyer and never appear on the invoice**, which always states the full sale value.

Each payout from the payment provider is recorded in a `payments` settlement record:

```text
gross amount − provider fee − withholdings (income tax, VAT, ICA, as reported) = net amount deposited
```

- Values come from the provider's settlement report, not from platform calculations.
- This enables reconciliation between invoiced sales and bank deposits, and gives the accountant the withheld amounts as prepayments.

Colombian reference rules (verify again before production):

| Rule | Source |
|---|---|
| Card sales by income-tax payers: 1.5% income-tax withholding by card issuers, on the amount before commission and excluding VAT | DUR 1625 of 2016, art. 1.3.2.1.8 (quoted in DIAN Oficio 22609 of 2019) |
| Payments via payment providers, aggregators, or acquirers to natural persons not responsible for VAT: not subject to income-tax withholding | Estatuto Tributario art. 401-4 |
| SIMPLE taxpayers: not subject to income-tax withholding, without prejudice to VAT withholding | Estatuto Tributario art. 911 |
| Card issuers act as VAT withholding agents | Estatuto Tributario art. 437-2, num. 5 |

A Ministry of Finance draft decree (October 2025) on withholding for electronic payments was identified; its final status was not verified.

## 8. Colombian Reference Facts

| Fact | Source |
|---|---|
| Natural-person retailers, artisans, and small farmers are not VAT-responsible only if they meet **all** conditions, including gross income from the activity below 3,500 UVT, a single establishment, no franchises, not customs users, no taxed contract ≥ 3,500 UVT, and bank deposits from taxed activities ≤ 3,500 UVT | Estatuto Tributario art. 437 par. 3 (quoted in DIAN Oficio 130 of 2023) |
| UVT 2026 = COP 52,374 | DIAN Resolution 238 of 2025 |
| SIMPLE: gross income below 100,000 UVT; requires electronic invoicing mechanisms | Estatuto Tributario art. 905 |
| SIMPLE taxpayers are VAT-responsible and must issue electronic invoices | Estatuto Tributario art. 915 |
| VAT responsibility and the obligation to invoice are independent | DIAN Concepto Unificado 106 of 2022 |
| E-invoices are UBL 2.1 XML identified by a CUFE, validated by DIAN before issuance | DIAN Technical Annex v1.9; DIAN Resolution 165 of 2023 |

## 9. Invoicing Provider Options

Selected: **Factus, sandbox only.** The Factus adapter may be built and tested against the Factus sandbox with fictitious data; production activation is pending. All options plug into the same `InvoiceIssuer` port; switching does not affect other modules.

| Option | Summary |
|---|---|
| **Technology provider (e.g., Factus)** | REST API; the provider builds, signs, and submits the XML and emails the buyer the PDF, XML, and public link. Annual prepaid document packages. See details below |
| **Own software** | DIAN habilitación with own development: UBL 2.1, CUFE, XAdES-EPES signature with an ONAC-accredited certificate, SOAP with WS-Security. Implementable in Go (e.g., `cofacture`, AGPL-3.0 or commercial license) or as a stateless Java service |
| **None** | No fiscal documents; order confirmations only. Applicable only when the merchant has no legal obligation to issue fiscal documents |

**Factus integration notes** (from its public developer documentation):
- OAuth2 password grant; tokens refreshed with a refresh token.
- Rate limit of 80 requests per minute per user; respect HTTP 429 and `Retry-After`.
- `reference_code` = our invoice UUID. Resubmitting a validated `reference_code` returns the same invoice (idempotent), matching at-least-once outbox delivery.
- No webhooks; validation responds synchronously.
- Item prices are sent without taxes or discounts; rounding differences with payments go in `cash_rounding_amount` (±500).
- `GET /v2/subscriptions` reports remaining documents; the admin panel should warn before the package runs out.
- The free sandbox is shared with other integrators: never send real customer data.

## 10. Sources

- Estatuto Tributario, arts. 424 and 468-1 (Senate official text): http://secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr017.html, http://www.secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr019.html
- DIAN Oficio 130 of 2023 (art. 437 par. 3): https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_0130_2023.htm
- DIAN Resolution 238 of 2025 (UVT 2026): https://normograma.dian.gov.co/dian/compilacion/docs/resolucion%5Fdian%5F0238%5F2025.htm
- Estatuto Tributario arts. 437-2, 905, 911, 915: https://estatuto.co/437-2, https://estatuto.co/905, https://estatuto.co/911, https://estatuto.co/915
- Estatuto Tributario art. 401-4: https://leyes.co/se_expide_el_estatuto_tributario_de_los_impuestos_administrados_por_la_direccion_general_de_impuestos_nacionales/401-4.htm
- DIAN Oficio 22609 of 2019 (card withholding): https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_22609_2019.htm
- DIAN Concepto Unificado 106 of 2022: https://normograma.dian.gov.co/dian/compilacion/docs/concepto_tributario_dian_0000106_2022.htm
- DIAN e-invoicing options and own software: https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/como-puedes-facturar-electronicamente/, https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_13246_2025.htm
- DIAN Technical Annex v1.9: https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf
- Factus developer documentation: https://developers.factus.com.co/buenas-practicas/preguntas-frecuentes, https://developers.factus.com.co/limite-de-request, https://developers.factus.com.co/skills/facturas-crear-y-validar.md, https://developers.factus.com.co/suscripciones/suscripciones, https://developers.factus.com.co/autenticacion/auth
