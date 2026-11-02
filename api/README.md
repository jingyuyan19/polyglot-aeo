# Polyglot license Worker (Creem proxy)

Mirrors the [Loka plugin](https://github.com/your-org/LokaFramerPlugin) pattern: **Creem checkout** + **Cloudflare Worker** for checkout/activate/validate.

## Deploy

```bash
cd api
npx wrangler deploy
```

Set secrets (production + test). Never commit secret values to this repo:

```bash
npx wrangler secret put CREEM_API_KEY
npx wrangler secret put CREEM_TEST_API_KEY
npx wrangler secret put MINIMAX_API_KEY
npx wrangler secret put AI_SESSION_SECRET
npx wrangler secret put AI_USAGE_SALT
```

Production should be routed through the approved business domain:
`https://license.polyglotaeo.com`. The default `wrangler.toml` disables
`workers.dev` and maps the Worker to that custom domain so checkout traffic,
license activation, and published-site verification all use the same
Polyglot AEO-owned domain family.

Before deploying this config, add `license.polyglotaeo.com` as a Worker custom
domain in Cloudflare and make sure the domain is approved in Creem or confirmed
by Creem Support.

## Production vs test mode

`wrangler.toml` sets `ENVIRONMENT = "production"`. Do **not** set
`CREEM_TEST_MODE` on that Worker. Client `test_mode` (checkout query or JSON
body) is ignored. `GET /checkout?test_mode=true` returns 403 unless the Worker
itself is in test mode, so a Creem test-card purchase cannot mint a license
that spends the live MiniMax quota.

Test mode is server-side only, and only outside production. Set **both** on a
local or staging Worker (never on the production deploy):

```bash
# wrangler.toml [env.staging.vars], or a shell override for wrangler dev
ENVIRONMENT=development
CREEM_TEST_MODE=true
```

`ENVIRONMENT` must be one of `development`, `dev`, `staging`, `preview`,
`test`, or `local`. If it is missing, `production`, or anything else,
`CREEM_TEST_MODE` has no effect. In test mode the Worker uses
`CREEM_TEST_API_KEY` plus `CREEM_TEST_PRODUCT_MONTHLY` /
`CREEM_TEST_PRODUCT_YEARLY`. `/activate` and `/validate` reject a license whose
`product_id` is missing or is not one of those configured product ids (403).

## Plugin env (release build)

```bash
# .env.local or CI
VITE_LICENSE_API_BASE=https://license.polyglotaeo.com
VITE_MANAGED_AI=true
```

Purchase buttons open `{VITE_LICENSE_API_BASE}/checkout`; the Worker creates a
fresh Creem checkout session and redirects to Creem. `VITE_CREEM_CHECKOUT_*`
can still be set as a static emergency fallback.

## Endpoints

| Method | Path | Body |
|--------|------|------|
| GET | `/checkout?plan=monthly\|yearly&project_id=...` | Client `test_mode=true` is rejected with 403 unless server test mode is on |
| POST | `/activate` | `{ key, instance_name?, project_id? }` |
| POST | `/validate` | `{ key, instance_id }` |
| POST | `/deactivate` | `{ key, instance_id }` |
| POST | `/ai/session` | `{ key, instance_id, project_id? }` |
| POST | `/ai/generate` | `{ feature, prompt, max_tokens?, idempotency_key? }` with `Authorization: Bearer <session>` |
| GET | `/health` | — |
| GET | `/verify-fetch?url=https://…` | Published-site HTML/text fetch (SSRF-safe; used by plugin verifier) |

`/activate` sends the human-readable Framer project name as Creem
`instance_name`. Creem returns the canonical activation `instance.id`; store
that as `instance_id` for `/validate` and `/deactivate`. The Framer project id
is kept only as `project_id` attribution.

## Managed AI

The Marketplace plugin must not ask users to paste third-party AI provider API
keys or call AI providers directly from the browser. Release builds therefore
use the Worker as a managed AI gateway:

1. The plugin calls `/ai/session` with the existing Creem license key and
   activation instance id.
2. The Worker validates the license with Creem and returns a 15-minute signed
   session token.
3. The plugin calls `/ai/generate`; the Worker checks Durable Object quotas,
   calls MiniMax M3 with server-held credentials, and returns only the model
   output plus token/cost metadata.

Usage quotas are configured in `wrangler.toml` vars and enforced atomically by
the `AI_USAGE_LIMITER` Durable Object. The Worker stores only hashed license
subjects and cost counters; it does not persist prompts, page content, model
outputs, raw license keys, or the MiniMax API key.

## Local dev

```bash
npx wrangler dev
# Plugin: VITE_LICENSE_API_BASE=http://localhost:8787
```

`wrangler dev` follows `ENVIRONMENT=production` unless you override it. To
exercise Creem sandbox checkout against this Worker locally:

```bash
npx wrangler dev --var ENVIRONMENT:development --var CREEM_TEST_MODE:true
```

Or skip the Worker locally with `VITE_DEV_PRO=true` (dev only).
