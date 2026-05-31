# Creem licensing (Polyglot AEO)

Aligned with **Loka Framer Plugin**: Creem checkout + Cloudflare Worker proxy.

## Architecture

```
Customer → Worker checkout URL ({WORKER}/checkout?plan=monthly)
                ↓
         Creem checkout session
                ↓
         Email with license key
                ↓
Plugin Settings → POST {WORKER}/activate { key, instance_name, project_id }
                ↓
Store returned Creem instance.id
                ↓
Every 24h → POST {WORKER}/validate { key, instance_id }
                ↓
Remove license → POST {WORKER}/deactivate { key, instance_id }
```

- **Creem API key** only on the Worker (`api/` — `CREEM_API_KEY` secret).
- **Checkout sessions** are created on demand by the Worker so each upgrade click
  can include Framer project metadata and a fresh success URL.
- **Plugin** never holds the API key; stores license in Framer **plugin data** (per project).
- **`instance_name`** = Framer project name for readable Creem activations.
- **`instance_id`** = Creem activation instance id returned by `/licenses/activate`.
- **`project_id`** = Framer project id, stored only for attribution/debugging.

## Deploy Worker

See [api/README.md](../api/README.md):

```bash
cd api && npx wrangler deploy
npx wrangler secret put CREEM_API_KEY
```

## Plugin environment (production build)

```bash
VITE_LICENSE_API_BASE=https://polyglot-license.<your-subdomain>.workers.dev
```

Upgrade buttons open `{VITE_LICENSE_API_BASE}/checkout`, and the Worker redirects
to Creem after creating a fresh checkout session. `VITE_CREEM_CHECKOUT_*` can
still be set as a static emergency fallback.

## polyglotaeo.com (optional)

Static/marketing only: pricing copy, privacy, refund policy, `schema-rules-v1.json`.  
No license API on Next.js — see `polyglotaeo-web/README.md`.

## Manual test script

### 1. Sandbox purchase

1. Open plugin Settings → Polyglot AEO Pro.
2. Switch **Checkout and license environment** to **Test**.
3. Click **Get Pro** / **Upgrade** inside the plugin.
4. Complete checkout; copy license key from email.

### 2. Plugin activate

1. Set `VITE_LICENSE_API_BASE` to your Worker (or `wrangler dev` + localhost).
2. Keep the Settings environment switched to **Test** while testing sandbox keys.
3. Settings → Polyglot AEO Pro → paste key → Activate.
4. Pro badge; Meta generate on 2+ locales.

Production and test licenses are stored separately in project plugin data, so
switching modes will not mix sandbox keys with live keys.

### 3. Offline grace

1. Pro active, disconnect network → still Pro for up to 24h.
2. Reconnect → Refresh license.

### 4. Revoke

1. Cancel subscription in Creem.
2. Validate returns inactive → plugin Free tier.

### 5. Free tier

1. Deactivate license.
2. 2 locales → upgrade banner; 6th schema install / 4th Meta sample / non-default locale generation → Upgrade modal.

## Dev bypass

```bash
# .env.local — npm run dev only
VITE_DEV_PRO=true
```

## Product setup

[CREEM-PRODUCTS.md](./CREEM-PRODUCTS.md)
