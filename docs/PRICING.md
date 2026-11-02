# Pricing strategy

> **Positioning:** Polyglot AEO is the **pre-launch and post-publish AEO
> quality console for multilingual Framer sites**. Marketplace ships as
> **Free install + Pro subscription** (Creem).
> Checkout and license activation run on [polyglotaeo.com](https://polyglotaeo.com);
> the plugin gates AI production features via entitlements. See
> [CREEM-LICENSING.md](./CREEM-LICENSING.md).

## Two pricing layers to clarify upfront

There are **two unrelated pricing layers** any Polyglot AEO customer faces.
Confusing them is the most common support question, so internally we always
talk about them separately:

1. **Polyglot AEO subscription** (us). **Free** tier + **Pro** $19/mo or $190/yr
   (Creem + license per Framer project). Business tier deferred.
2. **Framer site subscription** (Framer, the platform). Free / Basic $10 /
   Pro $30 / Scale $100. Determines what features of *Framer* you can
   actually publish through — including Static Files (Pro+) and the Multiple
   Locales add-on (Pro+, $20/locale).

A user on **Polyglot AEO Pro** still can't deploy llms.txt unless they're
also on **Framer Pro+**, because llms.txt requires Framer's Static Files
feature. We don't gate around this — we surface it clearly in-product (the
deploy guide carries a "Framer Pro+" badge) and in marketplace copy.

### Framer plan compatibility matrix (for our own reference)

| Polyglot AEO feature | Framer Free | Framer Basic ($10) | Framer Pro+ ($30+) |
|---|---|---|---|
| Per-locale JSON-LD via Custom Code | ✅ | ✅ | ✅ |
| AI localized meta (paste into SEO panel) | ✅ | ✅ | ✅ |
| llms.txt deploy via Framer Static Files | ❌ | ❌ | ✅ |
| Multiple locales (the Framer add-on itself) | ❌ trial only | ❌ | ✅ paid add-on |

**Implication for ICP**: our paying customer is overwhelmingly a Framer
**Pro+ user** — they have the locales to multiply schema across, and they
can deploy llms.txt. Basic/Free Framer users get partial value but are not
the buyer profile we should optimize for.

---

## Future paid tiers — anchored on AEO peers

| Tier | Price | Target buyer | Gating logic |
|---|---|---|---|
| **Free** | $0 | Tire-kickers, single-locale sites | Default-locale AEO QA and a small real repair: Control Center issue preview; CMS gap preview; manual schema; limited schema install; single `llms.txt`; published-site verifier |
| **Pro** | **$19 / month** *(or $190/year — 17% off)* | Framer Pro+ users, agencies | The full multilingual launch QA loop: every locale, managed AI Meta/schema/llms generation, unlimited schema install/translate, install history, quality checks, local translation memory, full client report export |

> **Business tier (deferred to v1.1+).** A higher-priced tier built around
> **AI citation monitoring** (ChatGPT / Perplexity / Claude / Gemini per
> locale, citability score, weekly email reports) is on the roadmap but
> NOT implemented yet — and we will not list, charge for, or imply it
> exists in any marketing surface until the code ships. Listing
> unimplemented features at launch destroys trust faster than launching
> with fewer tiers.
>
> Demand-validation gate: we'll ship the Business tier when ≥ 30 Pro
> customers explicitly ask for citation monitoring, OR when we hit
> $5K MRR — whichever comes first.

## Why these numbers

| Anchor | Price | Why we're cheaper / dearer |
|---|---|---|
| NoCodeAEO | $59/year ≈ $5/mo | Single-locale; we deliver per-locale value |
| Humblytics | $19/mo | Same price, different category — proves $19 is acceptable |
| CookieGuard | $8/mo | Cookie consent is commodity; AEO has more upside |
| Weglot | $17/mo (basic) | Translation tool, not SEO; we're complementary at the same price |
| Schema App (external) | $50/mo | Webflow/WP-only; multilingual support requires top tier ($300+/mo) |

Polyglot AEO Pro at **$19/mo** is positioned as a no-brainer for any agency
that bills $5K+ per Framer site — recovered on the first project.

## Launch discounts

### Founding member offer (first 100 customers)

- **50% off Pro for life** ($9.50/mo or $95/year)
- Featured in our public "founding partners" page (mutual SEO link)
- Direct DM access to the founder (you) for feature requests

This drives word-of-mouth and gives the first users an emotional stake in the
product's success.

### Loka cross-sell

For verified Loka users (require their license email):

- **30% lifetime discount on Pro** (so $13.30/mo)
- Bundled "Localization + AEO" pitch: the only complete multilingual stack
  for Framer

This is the strategic move — every Loka user is a high-intent Polyglot AEO
buyer, and you have a direct channel to reach them.

### Annual prepay

- 12 months for the price of 10 (17% off)
- Reduces churn, smooths cash flow

## Why subscription, not lifetime

- AI search engines update schema preferences continuously (Google AI
  Overviews changed three times in 2025). We owe customers an ongoing service.
- llms.txt spec is in active evolution.
- AI citation monitoring (planned for v1.1+) is genuinely a recurring
  service if/when we ship it.
- Lifetime sales cap your upside; subscriptions compound.

If churn becomes a problem, introduce a **lifetime tier at $299** (15× the
monthly) for the long-tail customers who refuse subs. Don't lead with it.

## Billing infrastructure

**Creem** for v1: direct checkout links, license keys, subscription lifecycle,
and a Cloudflare Worker proxy so the plugin never exposes the Creem API key.

Revisit Stripe Billing + Paddle only after the Creem flow becomes limiting
at scale. Until then, one billing stack keeps support and launch testing sane.

## Refund policy

**14 days, no questions asked.** Builds trust, reduces support load on the
"is this for me?" inquiries. Refund rate above 5% is the signal something is
broken (price, expectations, or product).

## Free → paid conversion levers

1. **Locale gate**: Free is hard-locked to 1 production locale. Anyone with 2+ locales
   must upgrade. This is the primary monetization signal — it's also the
   exact buyer profile we want. Conveniently, Framer also gates multiple
   locales behind Pro+, so the user who has 2+ locales is already paying
   Framer at least $30/mo and is unlikely to balk at our $19.
2. **Visible-risk gate**: Free shows the AEO Control Center, CMS gaps, and
   default-locale issues so users see what will fail before they hit a paywall.
   The upgrade asks for money only after the product has shown a concrete launch
   risk.
3. **AI meta gate**: Free gets 3 real default-locale generations so users can
   feel quality. Bulk generation and non-default locales show the upgrade modal.
4. **llms.txt gate**: Free can generate the default-locale `llms.txt` only;
   localized variants require Pro. (Framer Static Files is Pro+ on Framer's
   side too — so this gate aligns naturally.)
5. **Schema template freshness**: Free locks templates at install time;
   Pro receives auto-updates as Google / OpenAI / Anthropic publish new
   schema preferences.

## Long-term: usage-based add-on (post v1.1)

If/when AI Citation Monitoring ships and finds product-market fit, add a
**citation-credit add-on**: 100 monitored keywords × 5 engines × 4 weekly
checks = 2,000 credits/mo included; overage at $0.005/credit. This becomes
the third revenue stream and aligns price with usage as enterprises adopt.

Until then, this section is forward-looking commentary, not a launched plan.
