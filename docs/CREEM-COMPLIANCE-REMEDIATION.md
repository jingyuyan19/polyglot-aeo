# Creem Compliance Remediation

Use this when Creem flags unregistered checkout traffic for Polyglot AEO.

## Current Warning

- Source: Gmail message `19f1aca947cfe24d` from `noreply@creem.io`
- Subject: `CREEM Compliance Review - Unregistered Traffic Detected`
- Email time: `2026-06-30T23:08:31Z`
- Local action log: `tools/lead-finder/actions.local.csv`
- Status: `needs_action`

## Target State

- Public site: `https://polyglotaeo.com`
- Checkout bridge: `https://polyglotaeo.com/go/checkout/`
- Worker checkout/API: `https://license.polyglotaeo.com/checkout`
- Success URL: `https://polyglotaeo.com/success`
- Legacy Worker URL: `https://polyglot-license.jimmymjing.workers.dev/checkout`
  is not used for production checkout traffic unless Creem explicitly approves
  it during migration.

## Current Diagnostics

- `pnpm lead:checkout-origin` currently blocks promotion because
  `license.polyglotaeo.com` resolves only to `198.18.33.181`, which is a
  reserved/non-public address range for this production checkout origin.
- `https://license.polyglotaeo.com/health` fails TLS/fetch, so the Worker
  custom domain is not serving the health endpoint yet.
- Production `https://polyglotaeo.com/pricing/` and
  `https://polyglotaeo.com/go/checkout/` still expose the legacy
  `polyglot-license.jimmymjing.workers.dev` checkout origin.

## Do Not Do Yet

- Do not upload a new Marketplace package.
- Do not publish Framer Community posts.
- Do not submit directory forms.
- Do not send checkout-heavy cold traffic.
- Do not mark the warning resolved from local code changes alone.

## Fix Checklist

1. In Creem, verify that the Polyglot AEO store/business is registered for
   `https://polyglotaeo.com`.
2. Ask Creem Support to confirm whether `https://license.polyglotaeo.com` is
   approved under the same store or must be registered as a separate site/store.
3. In Cloudflare, add `license.polyglotaeo.com` as the Worker custom domain for
   `api/worker.js`, then confirm DNS resolves to public Cloudflare/Worker
   addresses rather than `198.18.33.181`.
4. Deploy the Worker only after the custom domain exists and the live Creem API
   secret is configured.
5. Rebuild and deploy `polyglotaeo-web` so pricing and `/go/checkout/` point at
   `https://license.polyglotaeo.com`.
6. Run:

```bash
pnpm lead:checkout-origin
pnpm lead:creem-compliance
pnpm lead:site-check
pnpm lead:marketplace-preflight
pnpm lead:ops
```

7. After Creem dashboard or support confirms closure, record:

```bash
pnpm lead:actions -- --add --type compliance_warning --channel creem --campaign unregistered_checkout_traffic --status resolved --target 'CREEM Compliance Review - Unregistered Traffic Detected' --evidence '<provider-dashboard-or-support-confirmation>' --note 'Creem compliance warning resolved'
```

## Support Draft

```text
Hi Creem Support,

We received a compliance warning about unregistered checkout traffic for our CREEM account.

Product/business: Polyglot AEO
Primary site: https://polyglotaeo.com
Checkout bridge: https://polyglotaeo.com/go/checkout/
Target checkout/session endpoint: https://license.polyglotaeo.com/checkout
Legacy checkout/session endpoint we plan to remove from production traffic: https://polyglot-license.jimmymjing.workers.dev/checkout
Success URL: https://polyglotaeo.com/success
Warning evidence: Gmail message 19f1aca947cfe24d from noreply@creem.io, 2026-06-30T23:08:31Z

Could you confirm which origin or business triggered the warning, and whether https://license.polyglotaeo.com should be approved under the existing Polyglot AEO store or represented as a separate approved store/site?

We have paused checkout-heavy promotion until the registered-store setup is correct.

Thanks,
Jimmy
```

## References

- Creem Checkout API: `https://docs.creem.io/api-reference/endpoint/create-checkout`
- Cloudflare Workers custom domains: `https://developers.cloudflare.com/workers/configuration/routing/custom-domains/`
