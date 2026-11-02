# Creem product setup (Polyglot AEO Pro)

Configure these items in the [Creem Dashboard](https://creem.io/dashboard) before production launch. Product IDs live in the Worker config, and the plugin points at the license Worker — see `.env.example` and [api/README.md](../api/README.md).

## Product: Polyglot AEO Pro

| Field | Value |
|-------|--------|
| Name | Polyglot AEO Pro |
| Type | Subscription |
| Billing | `every-month` **and** `every-year` on the same product (or two linked products) |
| Monthly price | $19 USD |
| Annual price | $190 USD (~17% off) |
| License | **Enabled** — **1 activation** per subscription (Framer `projectId` as `instance_name`) |

### License settings

- **Max activations:** 1 (Pro). Reserve `5` for a future Studio SKU on a second Creem product.
- **Activation:** Customer enters key in plugin Settings; plugin calls `{VITE_LICENSE_API_BASE}/activate` (Cloudflare Worker) with `instance_name` = Framer project name and `project_id` = Framer project id.
- **Validation:** Plugin stores the returned Creem activation `instance.id` and re-validates every 24h (cached) via `{WORKER}/validate`.
- **Deactivation:** Plugin calls `{WORKER}/deactivate` before removing the local license so the customer can reuse the activation on another project.

### Checkout metadata

- `metadata.referenceId` — stable customer id (Creem customer id or hashed email).
- Success redirect: `https://polyglotaeo.com/success?checkout_id={CHECKOUT_ID}` (see `polyglotaeo-web`).
- Current implementation creates checkout sessions on demand at `{WORKER}/checkout`
  and sends `metadata.source`, `metadata.plan`, and `metadata.projectId`.

### Discount coupons

| Code | Discount | Audience |
|------|----------|----------|
| `FOUNDING50` | 50% lifetime | Founding users (manual list) |
| `LOKA30` | 30% | Loka community |

Create both as **percentage** coupons in Creem and attach to the Pro product.

## Environment variables (production)

**Worker** (`api/` — `wrangler secret put`):

| Secret | Source |
|--------|--------|
| `CREEM_API_KEY` | Creem → API keys (live) |
| `CREEM_TEST_API_KEY` | Creem test key (sandbox) |

**Worker** (`api/wrangler.toml` — non-secret vars):

| Variable | Value |
|----------|-------|
| `CREEM_PRODUCT_MONTHLY` | Monthly product id |
| `CREEM_PRODUCT_YEARLY` | Yearly product id |
| `CREEM_SUCCESS_URL` | `https://polyglotaeo.com/success` |

**Plugin** (Vite — CI / `.env.local` for release builds):

| Variable | Example |
|----------|---------|
| `VITE_LICENSE_API_BASE` | `https://license.polyglotaeo.com` |
| `VITE_CREEM_CHECKOUT_MONTHLY` | Optional static fallback only |
| `VITE_CREEM_CHECKOUT_YEARLY` | Optional static fallback only |

## Compliance domain checklist

- [ ] Creem store/business is approved for Polyglot AEO and
  `https://polyglotaeo.com`.
- [ ] Creem Support or dashboard confirms checkout traffic from
  `https://license.polyglotaeo.com/checkout` is registered for the same store.
- [ ] Cloudflare Worker is routed through `license.polyglotaeo.com`.
- [ ] `workers.dev` production routing is disabled or confirmed by Creem as
  acceptable during migration.
- [ ] `pnpm lead:creem-compliance` is clear, and the original compliance warning
  is recorded as `status=resolved` before Marketplace/Community distribution.

## Sandbox checklist

- [ ] Test mode API key in `polyglotaeo-web` (`CREEM_TEST_MODE=true`)
- [ ] Test purchase → email with license key
- [ ] Plugin activate with key + open Framer project
- [ ] Pro features unlock (multi-locale Meta, llms AI, schema translate)
- [ ] Cancel subscription → webhook → validate returns inactive within 72h
- [ ] Plugin falls back to Free tier after cache TTL (24h max)

See [CREEM-LICENSING.md](./CREEM-LICENSING.md) for webhook events and API hand-test scripts.
