# Launch plan — Polyglot AEO

A 30-day plan from "build complete" to "first 100 paying customers".

## Pre-launch (week −2 to 0)

### Tech polish
- [x] Replace placeholder icon with branded mark (gradient indigo `#7C5CFF`).
- [ ] Record 45-second demo video (script in `MARKETPLACE-LISTING.md`).
- [x] Cloudflare Worker (`api/`) — Creem checkout/activate/validate proxy.
- [x] Creem dynamic checkout via Worker (`/checkout`) with product IDs in `api/wrangler.toml`.
- [x] Deploy Worker: `cd api && npx wrangler deploy` + live Creem secret.
- [x] Optional: static `polyglotaeo-web` for marketing pages.
- [x] Configure Creem Founding / Loka coupons — see [CREEM-PRODUCTS.md](./CREEM-PRODUCTS.md).
- [ ] Stand up `/changelog` so customers see we ship — major AEO update in
      the first 30 days is a strong retention signal.
- [ ] Add error reporting (Sentry free tier) so production issues surface.

### Distribution setup
- [ ] Announce list (ConvertKit) with single field: email + locale count
      ("How many languages does your Framer site speak?"). The locale count
      pre-segments your most valuable leads.
- [ ] X/Twitter account `@PolyglotAEO`. Pin a thread that breaks down "Why
      ChatGPT cites English content even when users ask in Spanish" — this
      is the wedge content.
- [ ] Indie Hackers profile, set up "Building Polyglot AEO" milestones.

### Asset prep
- [ ] 3 product screenshots: Dashboard, Schema generator with 5 locales
      side-by-side, AI Meta cycling languages.
- [ ] 1 carousel-style image set comparing "single-locale schema" vs
      "Polyglot AEO multi-locale schema" — visual punch for X/LinkedIn.

## Launch week (week 1)

### Day 1 — Marketplace submission
- Submit to Framer Marketplace early Monday morning (Pacific). Approval
  averages 3–5 business days; aim for live by Friday.
- Same day: ship pricing page and "Founding partners — 50% off forever"
  CTA. First 100 spots, scarcity is real.

### Day 1–3 — Channel launch (sequence)

**Tier-1 channels (your existing audiences)**

1. **Loka customer email** (highest-intent list).
   Subject: "I built the missing piece for your multilingual Framer site"
   Body lead: "Loka handles your translations. ChatGPT, Perplexity, and
   Claude don't see them — yet."
   CTA: 30% lifetime discount link.

2. **Ally Auditor customer email**.
   Subject: "From accessibility to AI search — a new compliance plugin"
   Body lead: positions Polyglot AEO as the natural sibling to Ally.
   CTA: founding partner 50% off.

3. **Gaode Maps customer email** (Chinese market angle).
   Subject (in Chinese): "出海 Framer 网站，让 ChatGPT 用每种语言引用你"
   Body: emphasize the cross-border angle — Chinese brands going global
   need every locale schema-marked correctly.

**Tier-2 channels (cold reach)**

4. **Twitter/X long-form thread**: "I audited 717 Framer plugins. Here's
   the one space nobody is filling." Tease the multilingual schema gap;
   end with launch link. Tag Framer's @official account and @schemapilot.

5. **Indie Hackers launch post**. Lead with the validation: "$6.5M paid to
   Framer creators in 2025; here's the plugin niche I found in the
   Marketplace data." Indie Hackers loves data-driven product stories.

6. **Reddit /r/framer**: post a build-in-public update — "I built a
   plugin to fix Framer's biggest multilingual SEO gap." Don't lead with
   the sale; lead with the technical problem.

7. **小红书 / X (Chinese)**: "Framer 多语言站如何被 ChatGPT 引用" —
   technical post in Chinese targeting cross-border designers. This is
   your unique distribution edge that competitors can't replicate.

**Tier-3 channels (paid / partnerships)**

8. Sponsor 2–3 Framer-focused YouTube creators (≤ $500 each).
9. Partner with a Framer template seller (e.g. LaunchNow, Fountn) for
   bundled "global launch kit" promo.

### Day 4–7 — Iterate on objections

Track every "interested but…" comment. Common objections you'll hear:

| Objection | Response |
|---|---|
| "Framer already does hreflang" | True for hreflang. NOT for `inLanguage` schema or per-locale FAQ pages. AI engines need the schema, not just the lang attribute. |
| "I just use Custom Code manually" | Show the install-uninstall safety fence. Show the AI meta generator. Show the 5-minute time-to-value. |
| "Why not lifetime?" | Schema preferences and llms.txt spec are moving targets. Subscription means we keep your site current. |
| "I don't have AI keys" | Free tier still does manual JSON-LD, which is the floor of value. |

## Weeks 2–4 — Compounding

### Content engine
- Weekly "AEO field notes" post: one technical observation per week
  (e.g. "Why German title length actually matters for AI Overviews").
  Cross-post X + Indie Hackers + LinkedIn. After 6 posts you have a
  blog that ranks.
- Pitch a guest post to **Schema App** (their blog covers Framer schema)
  and **better-i18n.com** (multilingual SEO niche).

### Lifecycle
- 3-day post-install email: "Did you generate schema for all your locales?"
  with a 1-min Loom showing the workflow.
- 14-day churn-warning email: "Your schema templates are drifting from
  current AEO best practices — open the plugin to refresh."
- Annual renewal: send a "year-in-review" report showing how many AI
  citations the user's site received per locale.

### Bundle plays
- Run a **"Global Launch Bundle"** week: Loka + Polyglot AEO + Ally Auditor
  for 30% off the trio. Position as the official global-launch stack.
- Reach out to top 5 Framer agencies offering them a **white-label
  agency tier** (5+ client sites, $99/mo). Agencies are leverage.

## North-star metrics (track weekly)

- **MRR** — single most important number.
- **Free → Pro conversion rate** — target 8% by week 4.
- **Activation rate** (% of installs that complete first schema install) —
  target 60% by week 4.
- **Churn (logo + revenue)** — target ≤ 5% monthly by week 12.
- **NPS** — collect via in-plugin prompt at the 30-day mark.

## What to NOT do

- ❌ Don't build a website builder. Polyglot AEO is a single-purpose tool.
- ❌ Don't translate body content. That's Loka / Weglot / DeepL territory.
- ❌ Don't undercut on price to compete with NoCodeAEO. Compete on
  multilingual; that's the moat.
- ❌ Don't promise "guaranteed AI citations". Citations are probabilistic.
  Promise *better-formed schema* and *measurable improvements*, not
  guarantees.
- ❌ Don't add Chinese market features (WeChat integration, Baidu schema)
  in v1. The global market is the wedge; come back to China later as a
  Business-tier add-on.

## 30-day target

- **400 free installs** (Marketplace organic + tier-1 launches)
- **40 paying customers** (10% conversion of intentful free → paid)
- **$760 MRR** (40 × $19) at the single Pro tier — Business tier is
  deferred to v1.1+ and not in launch-week revenue projections (see
  PRICING.md for the demand-validation gate)
- **3 customer testimonials** to feed into week-5 content

This is the floor. The realistic upside if Loka cross-sell hits is 2–3× this.
