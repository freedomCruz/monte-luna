# HTTP API Conventions

Canonical rules shared by every module contract in `contracts/openapi/`. A module contract may add rules but never contradict these. Shared schemas named here live in `contracts/openapi/common.yaml`.

Status: approved on 2026-10-13. Contract approach (contract-first OpenAPI 3.1, one document per module) is recorded in [system-architecture.md](system-architecture.md) section 3.

## Quick reference

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1/...` storefront, `/api/v1/admin/...` admin |
| Field names | `snake_case` |
| Identifiers | UUIDv7 strings |
| Money | Integer in minor units (centavos): `$38.000` is `3800000` |
| Dates | RFC 3339 UTC timestamps; `YYYY-MM-DD` for calendar dates |
| Errors | RFC 9457 `application/problem+json` with a stable `code` |
| Pagination | Cursor: `?limit=&cursor=`, response `next_cursor` |
| Admin auth | `__Host-session` cookie; CSRF by `http.CrossOriginProtection` |
| Retries | `Idempotency-Key` header on order placement and payment start |

## 1. Paths and versioning

- Storefront (public) paths: `/api/v1/<resource>`. Admin paths: `/api/v1/admin/<resource>`. Both surfaces of a module live in the same contract document.
- Resources are plural nouns in `kebab-case`: `/api/v1/products`, `/api/v1/products/{slug}`, `/api/v1/origins/{slug}`.
- Storefront reads address products and origins by `slug`; admin endpoints address records by `id`.
- Webhooks from providers live under the owning module: `/api/v1/payments/webhooks/wompi`.
- The version changes only for a breaking change across the whole API. Inside `v1`, changes are additive: new optional fields, new endpoints, new enum values documented as such. Removing or renaming a field follows expand → migrate → contract and needs an approved contract change.

## 2. Methods and status codes

| Method | Use | Success |
| --- | --- | --- |
| `GET` | Read; never changes state | `200` |
| `POST` | Create, or run an action (`/orders/{id}/cancel`) | `201` with `Location` for creation, `200` for actions |
| `PATCH` | Partial update (JSON Merge Patch semantics: absent field = unchanged, `null` = clear) | `200` with the updated resource |
| `PUT` | Full replacement, only where the contract says so | `200` |
| `DELETE` | Remove or archive | `204` |

Error statuses: `400` malformed request, `401` not authenticated, `403` not allowed, `404` not found (also used instead of `403` when revealing existence would leak data), `409` state conflict (out of stock, already paid), `412` precondition failed, `422` validation failed, `429` rate limited (with `Retry-After`), `500` unexpected, `503` dependency unavailable.

## 3. JSON body

- Content type `application/json; charset=utf-8`. Field names are `snake_case` and match the domain documents (`price_amount`, `compare_at_price_amount`, `production_date`).
- Responses return the resource object at the top level; collections use the envelope in section 6. No `data` wrapper for single resources.
- Optional values that are unknown are `null`; fields are not silently omitted. The contract marks every field `required` and uses `type: [..., "null"]` for nullable ones.
- Enums are lowercase `snake_case` strings (`published`, `out_of_stock`). Clients must tolerate unknown enum values.
- Unknown request fields are rejected with `422`, so typos never pass silently.

## 4. Data types

| Type | Format | Example |
| --- | --- | --- |
| Identifier | UUIDv7 string | `"0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f"` |
| Slug | lowercase `kebab-case` | `"finca-el-mirador-geisha-lavado"` |
| Money | integer, minor units of the store currency (COP centavos), field suffix `_amount` | `"price_amount": 3800000` |
| Timestamp | RFC 3339 in UTC, field suffix `_at` | `"created_at": "2026-10-13T15:04:05Z"` |
| Calendar date | `YYYY-MM-DD`, field suffix `_date` | `"production_date": "2026-10-02"` |
| Weight | integer grams, suffix `_grams` | `"weight_grams": 250` |
| Percentage | integer 0 to 100, suffix `_percentage` | `"cacao_percentage": 70` |

- Money never uses floating point and never carries currency per field: the store has one configured currency (COP). The frontend divides by 100 and formats without decimals (`$38.000`). The frontend never computes authoritative totals.
- Times are shown to customers in `America/Bogota`; the API always sends UTC.

## 5. Errors (RFC 9457)

Every error response has content type `application/problem+json` and this shape (`common.yaml#/components/schemas/Problem`):

```json
{
  "type": "https://monteluna.example/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "code": "validation_failed",
  "detail": "One or more fields are invalid.",
  "errors": [
    { "field": "shipping_address.municipality_code", "code": "unsupported_destination", "message": "We do not ship to this municipality yet." }
  ]
}
```

- `code` is the stable machine identifier, `snake_case`, listed in the module contract. Clients branch on `code`, never on `title` or `detail`.
- `errors` appears only for field validation; `field` is a dotted path into the request body.
- `detail` and `message` are safe to show to the end user. They never contain stack traces, SQL, internal ids of other users, or secrets.
- The placeholder domain in `type` is replaced when the store domain is registered.

## 6. Collections and pagination

```json
{
  "items": [ { "...": "..." } ],
  "next_cursor": "eyJpZCI6IjAxOTljNGUy..."
}
```

- Request: `?limit=` (default 24, maximum 100) and `?cursor=` taken from the previous `next_cursor`. `next_cursor` is `null` on the last page.
- Cursors are opaque strings; clients never build or parse them.
- Filters are query parameters named after fields (`?category=cafe&status=published`); multiple values repeat the parameter. Sorting uses `?sort=field` or `?sort=-field` with the allowed values listed in the contract.
- No total count by default. An endpoint that needs one (admin tables) declares a `total` field in its contract.

## 7. Authentication and security

- Storefront endpoints are anonymous. Guest order access uses the order tracking token from the private link in the confirmation email, never the order number alone (see [orders.md](../domain/orders.md) and [identity.md](../domain/identity.md)).
- Admin endpoints require the `__Host-session` cookie session (security scheme `adminSession` in `common.yaml`). Unauthenticated requests get `401`; insufficient role gets `403`.
- CSRF: the backend wraps state-changing routes with `http.CrossOriginProtection`. State never changes on `GET`, `HEAD`, or `OPTIONS`.
- The frontend and API share one origin behind Caddy, so no CORS is enabled.
- Rate-limited endpoints document `429` and the `Retry-After` header.
- Webhook endpoints authenticate the provider signature as specified in the owning domain document; they never use the admin session.

## 8. Idempotency and concurrency

- Order placement and payment start require an `Idempotency-Key` header (a client-generated UUID). Repeating a request with the same key within 24 hours returns the original result instead of acting twice; reusing a key with a different body returns `422` with code `idempotency_key_reused`.
- Admin updates to records edited concurrently use the `ETag` response header and an `If-Match` request header; a stale version returns `412` with code `version_conflict`.
- Provider webhooks are deduplicated by event id as defined in [data-modeling.md](data-modeling.md).

## 9. Caching

- Storefront read endpoints used by the live purchase island (price, stock, roast date) send `Cache-Control: no-store`.
- Other public reads may send short `Cache-Control: public, max-age=...` values documented per endpoint. Admin responses always send `Cache-Control: no-store`.

## Sources

- OpenAPI Specification 3.1: https://spec.openapis.org/oas/v3.1.0
- RFC 9457, Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
- RFC 3339, Date and Time on the Internet: https://www.rfc-editor.org/rfc/rfc3339
- RFC 7396, JSON Merge Patch: https://www.rfc-editor.org/rfc/rfc7396
- IETF draft, The Idempotency-Key HTTP Header Field: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Go `http.CrossOriginProtection`: https://pkg.go.dev/net/http#CrossOriginProtection
