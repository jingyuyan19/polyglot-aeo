# polyglotaeo.com

License **activate/validate** runs on the **Cloudflare Worker** in `../api/` (same pattern as Loka). This folder is only for:

- Landing / pricing copy (links should point to **Creem** `payment/prod_…` URLs)
- `public/schema-rules-v1.json` (Pro remote rules — also hostable on any static CDN)
- Privacy / terms / refund / contact / success pages required for payment review

Do **not** deploy Next.js license API routes; they were removed in favor of the Worker.

## Host schema rules

Serve `public/schema-rules-v1.json` at:

`https://polyglotaeo.com/schema-rules-v1.json`

Plugin default: `VITE_SCHEMA_RULES_URL` (optional override).

## Run locally (marketing only)

```bash
npm install && npm run dev
```

## Deploy to Netlify

Create a Netlify site from this `polyglotaeo-web` directory.

- Build command: `npm run build`
- Publish directory: `out`
- Node version: `22`

Environment variables:

```bash
NEXT_PUBLIC_SITE_URL=https://polyglotaeo.com
NEXT_PUBLIC_CHECKOUT_MONTHLY=https://www.creem.io/payment/...
NEXT_PUBLIC_CHECKOUT_YEARLY=https://www.creem.io/payment/...
```

Pages included for Creem review:

- `/`
- `/pricing/`
- `/success/`
- `/terms/`
- `/privacy/`
- `/refund/`
- `/contact/`
- `/robots.txt`
- `/sitemap.xml`
