# polyglotaeo.com

License **activate/validate** runs on the **Cloudflare Worker** in `../api/` (same pattern as Loka). This folder is only for:

- Landing / pricing copy (pricing defaults to the approved Worker checkout
  origin, `https://license.polyglotaeo.com`)
- Privacy / terms / refund / contact / success pages required for payment review

Do **not** deploy Next.js license API routes; they were removed in favor of the Worker.

Schema-generation rules are bundled with the Framer plugin package. The website
does not host runtime rules for the plugin.

## Run locally (marketing only)

```bash
npm install && npm run dev
```

## Deploy to Netlify

Create a Netlify site from this `polyglotaeo-web` directory.

- Base directory: `polyglotaeo-web`
- Build command: `npm run build`
- Publish directory: `out`
- Node version: `22`
- Enable Netlify Forms for `framer-aeo-mini-audit`, then add an email
  notification to `jimmymjing@gmail.com` so `pnpm lead:monitor` can pick up
  inbound audit requests.

Before sending outreach that links to `/audit/`, verify the production page:

```bash
pnpm lead:site-check
```

If the local Netlify CLI is authenticated, deploy from this folder with:

```bash
npx netlify-cli@latest deploy --prod --dir=out --site=49fc3e5b-7ff7-4185-b578-60c81e3168ff
```

If that command hangs or reports login/API errors, run `npx netlify-cli@latest login`
or deploy through the Netlify dashboard, then rerun `pnpm lead:site-check`.

### Netlify credit guardrail

Do not use production deploys to iterate on small copy, form, tracking, or
checkout changes. Netlify credit-based Free plans include 300 credits per
billing cycle, and each successful production deploy costs 15 credits. On
2026-06-30 (Asia/Shanghai), 20 successful production deploys for this site
consumed the full 300-credit allowance and paused new production deploys.

Use local builds and preview/branch deploys for iteration. Batch production
changes into one final deploy when the local build, checkout-origin checks, and
tracking checks are ready. Before any production retry, run:

```bash
pnpm lead:netlify-recovery
pnpm lead:tracking-freshness
```

Environment variables:

```bash
NEXT_PUBLIC_SITE_URL=https://polyglotaeo.com
NEXT_PUBLIC_FRAMER_MARKETPLACE_URL=https://www.framer.com/community/marketplace/plugins/polyglot-aeo/
NEXT_PUBLIC_LICENSE_API_BASE=https://license.polyglotaeo.com
# Optional emergency fallback only; leave unset for normal production.
# NEXT_PUBLIC_CHECKOUT_MONTHLY=https://www.creem.io/payment/...
# NEXT_PUBLIC_CHECKOUT_YEARLY=https://www.creem.io/payment/...
```

`NEXT_PUBLIC_CHECKOUT_MONTHLY` and `NEXT_PUBLIC_CHECKOUT_YEARLY` are optional
static emergency overrides. If they are absent, the pricing page falls back to
`NEXT_PUBLIC_LICENSE_API_BASE` `/checkout?plan=...` so each click creates a
fresh Creem session through the Worker on the approved custom domain.

The plugin upgrade modal routes checkout clicks through `/go/checkout/` first.
That static bridge records a `framer-aeo-event` Netlify form submission with
plan, reason, project id, and UTM fields, then redirects to the approved
Worker/Creem checkout target. It is not a payment API.

For production, the bridge allow-list only permits the approved Worker custom
domain (`license.polyglotaeo.com`), the pricing fallback, and Creem payment
URLs. Do not point public checkout traffic at the legacy `workers.dev` URL
unless Creem Support explicitly approves it.

Pages included for Creem review:

- `/`
- `/audit/`
- `/go/checkout/`
- `/pricing/`
- `/success/`
- `/terms/`
- `/privacy/`
- `/refund/`
- `/contact/`
- `/robots.txt`
- `/sitemap.xml`
