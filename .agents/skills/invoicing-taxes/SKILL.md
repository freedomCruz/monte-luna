---
name: invoicing-taxes
description: "Trigger: tax, VAT, IVA, invoice, factura, fiscal profile, tax category, withholding, retención, invoicing adapter. Apply the approved tax and invoicing rules."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when a change touches tax calculation, fiscal data, fiscal documents, invoicing adapters, or payment settlements with withholdings.

Do not use for order lifecycle, catalog, or payment gateway changes that touch no taxes, fiscal data, or withholdings.

## Hard Rules

- Read `docs/architecture/invoicing-and-taxes.md` completely before implementing.
- This is not tax advice. Never decide a merchant's regime, VAT responsibility, or product classification; expose them as configuration.
- Only the `TaxCalculator` port in `invoicing` computes taxes. No other module calculates tax.
- Never hard-code rates, UVT values, or thresholds in application code; read them from dated tables. Literal values may appear only in tests and clearly labeled seed data.
- If the merchant profile has `vat_responsible = false`, no line carries VAT and issuers receive lines as excluded.
- Snapshot per-line tax data at checkout. Build fiscal documents only from that snapshot; never recalculate.
- Issuance runs after `OrderPaid` through the outbox. A failure never blocks or reverts a sale; record `pending`, `failed`, or `rejected`, and retry.
- Issued documents are immutable; corrections use credit notes.
- Official numbering belongs to the issuer adapter. Never use PostgreSQL sequences for fiscal numbers.
- Withholdings never appear in checkout, orders, or invoices; record them only in `payments` settlements from provider reports.
- Credentials, certificates, PINs, and technical keys never enter the repository.
- Never send real customer data to a provider's shared sandbox.

## Decision Gates

| Situation | Action |
| --- | --- |
| Factus adapter work | Allowed against the Factus sandbox with fictitious data only |
| Production issuance or another provider requested | Stop: pending; ask the user |
| New country | New adapters plus dated data rows; no changes to other modules |
| Law or rate change | Insert new dated rows; do not edit history |
| Rounding differences with a provider | Handle inside that country's or provider's adapter |
| Fiscal question not answered by the docs | Mark it for the merchant's accountant; do not guess |

## Execution Steps

1. Write tests first: VAT-responsible and non-responsible profiles, each tax category, rounding boundaries, snapshot immutability.
2. Implement behind the ports; keep country logic in adapters.
3. Run every verification gate.

## Output Contract

Report:
- Ports, adapters, and dated data touched.
- Test results for the cases in step 1.
- Confirmation that no tax values are hard-coded outside tests or labeled seed data.
- Pending fiscal questions and residual risks.

## References

Paths are relative to the repository root.

- `docs/architecture/invoicing-and-taxes.md` — fiscal design and sources.
- `docs/architecture/data-modeling.md` — section 13, tax, fiscal, and settlement data.
