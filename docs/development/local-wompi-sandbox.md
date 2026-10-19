# Local Wompi sandbox test

How to run a real Wompi sandbox payment against the local storefront and API. Payment rules live in [payments.md](../domain/payments.md); this page only covers the local environment.

## Why the defaults do not work

| Symptom | Cause |
| --- | --- |
| The Wompi widget does not open; the browser console shows `403` from `checkout.wompi.co` with a CloudFront "Request blocked" page | Wompi's firewall rejects a `redirect-url` that points to `localhost` or `127.0.0.1` |
| Images are broken when the storefront is opened with another host name | The API builds absolute image URLs from `MEDIA_BASE_URL`; a different host is cross-origin and the browser may block local resources requested from another site |

The fix is one host name, used by the browser, the redirect URL, and the image URLs.

## One-time setup

1. Map a host name to your machine. Open `C:\Windows\System32\drivers\etc\hosts` as administrator (or `/etc/hosts` on macOS and Linux) and add:

   ```text
   127.0.0.1 monteluna.test
   ```

   Check it with `ping monteluna.test`; it must answer from `127.0.0.1`. On Windows, run `ipconfig /flushdns` if it does not.

2. In the root `.env`, set the Wompi sandbox keys (see `.env.example`) and:

   ```text
   LOCAL_STOREFRONT_HOST=monteluna.test
   ```

   `Taskfile.yml` derives `STOREFRONT_BASE_URL`, `MEDIA_BASE_URL`, and the Astro `--allowed-hosts` value from this variable and the worktree's `FRONTEND_PORT`. Leave it unset to keep `127.0.0.1`.

## Run

Start both servers through Task, so the derived values apply:

```bash
task backend:dev
task frontend:dev
```

Open `http://monteluna.test:<FRONTEND_PORT>` (`task setup:preview` prints the port). Always use that address: the cart lives in the browser's storage for each address, so a cart filled on `127.0.0.1` is not visible on `monteluna.test`. Cart items keep the image URL from the moment they were added, so empty the cart after changing `LOCAL_STOREFRONT_HOST`.

Before paying, check in DevTools > Network that the `payments` response has a `redirect_url` that starts with `http://monteluna.test:`.

## Sandbox test data

From the [Wompi sandbox data page](https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/):

| Method | Approved | Declined |
| --- | --- | --- |
| Card (any future expiry, 3-digit CVC) | `4242 4242 4242 4242` | `4111 1111 1111 1111` |
| Nequi | `3991111111` | `3992222222` |
| PSE (widget) | "Banco que aprueba" | "Banco que rechaza" |

Any other card or Nequi number ends in `ERROR`.

## What to expect locally

- Wompi cannot reach your machine, so webhooks never arrive. The order is confirmed only by `/pedido`, which calls `POST /api/v1/payments/verify` with the `id` that Wompi adds to the redirect URL.
- After an approved payment the database holds the order in `paid`, the attempt in `approved`, and the `payments.payment_approved` and `orders.order_paid` outbox events in `delivered`:

  `scripts/dev/order-flow.sql` prints the whole persisted flow of one order (order, lines and lots, status history, payment attempts, outbox events, inventory movements, refunds):

  ```bash
  docker cp scripts/dev/order-flow.sql ecommerce-postgres-1:/tmp/order-flow.sql
  docker exec -it ecommerce-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d <WORKTREE_DB> -v ord=ORD-XXXXXXXX -f /tmp/order-flow.sql'
  ```

## Start again from a clean database

Stop `task backend:dev`, then run:

```bash
task dev:db:reset
```

It asks for confirmation, drops this worktree's database (never the shared `POSTGRES_DB`), recreates it, applies all migrations, and loads the demo catalog and shipping rates. Orders, payments, outbox events, and refunds start empty. Empty the browser cart afterwards, because it keeps variant ids from the previous data.

## Notes

- The Astro dev proxy keeps the browser `Host` header (`changeOrigin: false`), so the backend cross-origin check on `POST /api/v1/orders` sees `Origin` and `Host` match on any local host name. Requests from another origin are still rejected with `403`.
- Starting the servers by hand without Task skips the derived values; set `STOREFRONT_BASE_URL`, `MEDIA_BASE_URL`, `CATALOG_API_URL`, `API_ADDR`, and `--allowed-hosts` yourself.
- Astro runs one dev server per project. If `task frontend:dev` says another server is running, stop it (`npx astro dev stop` from `frontend/`) first.
