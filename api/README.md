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
| GET | `/checkout?plan=monthly\|yearly&project_id=...` | — |
| POST | `/activate` | `{ key, instance_name?, project_id?, test_mode? }` |
| POST | `/validate` | `{ key, instance_id, test_mode? }` |
| POST | `/deactivate` | `{ key, instance_id, test_mode? }` |
| POST | `/ai/session` | `{ key, instance_id, project_id?, test_mode? }` |
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

Or skip the Worker locally with `VITE_DEV_PRO=true` (dev only).
