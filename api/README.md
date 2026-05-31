# Polyglot license Worker (Creem proxy)

Mirrors the [Loka plugin](https://github.com/your-org/LokaFramerPlugin) pattern: **Creem checkout** + **Cloudflare Worker** for checkout/activate/validate.

## Deploy

```bash
cd api
npx wrangler deploy
```

Set secrets (production + test):

```bash
npx wrangler secret put CREEM_API_KEY
npx wrangler secret put CREEM_TEST_API_KEY
```

Note the deployed URL, e.g. `https://polyglot-license.<account>.workers.dev`.

## Plugin env (release build)

```bash
# .env.local or CI
VITE_LICENSE_API_BASE=https://polyglot-license.<account>.workers.dev
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
| GET | `/health` | — |

`/activate` sends the human-readable Framer project name as Creem
`instance_name`. Creem returns the canonical activation `instance.id`; store
that as `instance_id` for `/validate` and `/deactivate`. The Framer project id
is kept only as `project_id` attribution.

## Local dev

```bash
npx wrangler dev
# Plugin: VITE_LICENSE_API_BASE=http://localhost:8787
```

Or skip the Worker locally with `VITE_DEV_PRO=true` (dev only).
