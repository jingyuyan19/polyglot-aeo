# Framer Lead Finder

This folder turns manually curated Framer prospects into outreach-ready mini audits.

## Report-first inline audit pilot

The report-first workflow puts the complete 3-check audit in the email body.
It never sends a PDF, image, CSV, Markdown file, or other attachment to a
prospect. Generated `.txt`, `.eml`, HTML, JSON, Markdown, and CSV files are
local review/draft artifacts only.

Build a transparent public audit for one or more URLs:

```bash
pnpm lead:public-audit -- --url https://example.com
```

Build the default 5-old/5-new dry-run pilot from the CRM and current lead scan:

```bash
pnpm lead:report-pilot
```

The pilot requires custom-domain multilingual sites, company-domain contacts,
an email domain that matches the audited site, a non-support/legal/hiring
mailbox, at least 75% observable score coverage, two live pages with different
locale families, and at least two high-confidence public findings. It
schedules at most two reviews per business day. When both cohorts still have
candidates, a day receives one old and one new contact; when either cohort is
exhausted, the other cohort fills the remaining slots. This keeps a 10-contact
pilot to five business days even for an approved mix such as 1 old + 9 new.
Use `--cohort-note` to preserve the reason for a cohort change in the JSON and
Markdown outputs. The command does not change CRM or send anything.

Export the local sender-gate variables in the shell (the names are documented
in `.env.example`), then check SPF, DKIM, DMARC, the postal footer,
suppression state, and every selected contact:

```text
OUTREACH_SENDER_EMAIL=jimmy@polyglotaeo.com
OUTREACH_DKIM_SELECTOR=google
SENDER_POSTAL_ADDRESS=Your valid business mailing address
```

```bash
pnpm lead:report-preflight
```

After manually approving the inline reports and importing/marking the selected
rows `report_ready`, generate local drafts:

```bash
pnpm lead:sendpack -- \
  --status report_ready \
  --variant report-first-v1 \
  --audits .tmp/polyglot-report-pilot.json
```

`lead:sendpack` refuses this variant when the sender preflight is missing or
stale, a report lacks sufficient evidence, a recipient uses a free/personal
mailbox, or the postal footer is absent. The optional product link is off by
default.

After recording a fresh per-contact review in
`.tmp/polyglot-report-send-review.json`, generate a Resend dry-run:

```bash
pnpm lead:report-send -- --date 2026-07-13 --schedule-at 2026-07-13T08:30:00Z
```

For each later pilot day, refresh the same fixed contacts before reviewing or
sending. This command never reselects the cohort:

```bash
pnpm lead:report-refresh -- --date 2026-07-14
pnpm lead:crm -- --import .tmp/polyglot-report-refresh.csv --today 2026-07-14
pnpm lead:report-preflight
```

Only `--execute` makes an API call. The sender requires exactly the scheduled
cohort size, passing and unexpired SPF/DKIM/DMARC and suppression checks,
`report_ready` CRM state, a same-day public audit, three reviewed evidence
URLs, and a review manifest no more than six hours old. It sends plain text
with no attachment, HTML, remote image, or tracking pixel. Each request uses a
Resend idempotency key and a durable local ledger before the CRM is advanced
to `report_sent`:

```bash
pnpm lead:report-send -- \
  --execute \
  --date 2026-07-13 \
  --schedule-at 2026-07-13T08:30:00Z
```

Record any human response as `report_replied`; add
`--report-reply-quality qualified` only when they ask for a fix, discuss a
finding, request installation, or ask about implementation. Review the 24h,
72h, and 7d gates without sending a follow-up:

```bash
pnpm lead:report-review
```

The public score uses four weighted dimensions: crawl/indexability (25), locale
discovery (30), structured data (25), and metadata consistency (20). Pass earns
full points, warning half, fail zero, and `not_observed` is excluded. `llms.txt`
is reported only as an optional interoperability signal and never affects the
score.

This tooling enforces technical guardrails, not jurisdiction-specific legal
advice. Before a manual send, confirm the recipient and message against the
[FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business),
[CNIL B2B email guidance](https://www.cnil.fr/la-prospection-commerciale-par-courrier-electronique),
[ICO B2B marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/),
and [Gmail sender guidelines](https://support.google.com/mail/answer/81126) as
applicable.

## Daily command

For normal operation, use the single daily pipeline:

```bash
pnpm lead:daily -- --search-input tools/lead-finder/search-results.local.txt
```

It runs discovery, scan, outreach drafting, CRM import, and today's action plan.

Outputs:

```text
.tmp/framer-leads.csv
.tmp/framer-outreach.md
.tmp/framer-outreach.csv
.tmp/framer-actions.md
tools/lead-finder/outreach.local.csv
```

Use the step-by-step commands below when debugging or tuning a stage.

Before expanding a cold email batch, run the growth gate:

```bash
pnpm lead:gate
pnpm lead:public-preflight
pnpm lead:next-public-actions
pnpm lead:today
pnpm lead:blocker-brief
```

It reads the CRM, CTA events, Netlify forms, external action log, Marketplace
review, and distribution review, then writes:

```text
.tmp/framer-growth-gate.md
.tmp/framer-growth-gate.json
```

`lead:today` consolidates the current gates into the shortest execution plan:
safe local checks, actions that need explicit confirmation, scheduled reviews,
external blockers, and stop rules. Run it before `lead:ops` when deciding what
can actually happen today. It also reads the latest customer-feedback and
landing-baseline confirmation briefs, so the next confirmation row includes the
external action target, risk, expected benefit, verification path, and exact
confirmation phrase.

`lead:blocker-brief` creates `.tmp/framer-blocker-resolution-brief.md/json` as
the action-time unblock plan. It combines payment recovery, checkout-origin,
Cloudflare/Netlify apply dry-runs, Creem, Marketplace, public preflight, and
Community launch evidence into one ordered path with the next confirmation
phrase, commands, required evidence, and stop rules.

For the multi-plugin portfolio view, run:

```bash
pnpm lead:public-health
pnpm lead:portfolio
pnpm lead:portfolio-experiments
```

It refreshes public Marketplace, landing, pricing, checkout, and health facts
for Polyglot AEO, Ally Auditor, Loka, and Gaode Maps, then writes
`.tmp/framer-portfolio-growth-dashboard.md/json` and per-plugin files under
`docs/growth/plugins/`. Use it before deciding which plugin deserves the next
growth experiment. `lead:portfolio-experiments` reads
that dashboard plus `tools/lead-finder/portfolio-experiments.local.csv`, then
writes `.tmp/framer-portfolio-experiments.md/json` with confirmation-gated
action packs, review windows, and the local next step for each plugin/channel
experiment. Run `pnpm lead:portfolio-experiments -- --seed` once when the
experiment log is missing.

`lead:today` and `lead:ops` now include the portfolio priority table and
experiment queue directly, so the normal daily read is:

```bash
pnpm lead:portfolio-ops
```

It writes `.tmp/framer-portfolio-ops-run.md/json` as the single daily entry
point. The runner refreshes read-only signal inputs, Polyglot checkout-origin
readiness, public health, Loka checkout inventory, portfolio files, experiments, asset kits, landing/tracking baselines,
landing target decision brief, asset coverage, landing confirmation brief, plugin channel fit matrix, customer feedback queue and confirmation brief,
owned-site audit, Creem link inventory, Creem store/domain verification brief, owned-site CTA kit, owned-site implementation, use-case page briefs, use-case page local packages, customer feedback review queue, confirmation queue, publish preflight, experiment decision brief, growth goal coverage audit, executive brief, action-time packet, public action review, growth gate, channel
priority, partner log, today plan, weekly report, and ops dashboard. It
continues after non-critical read failures and marks the run `partial` when a
source needs attention.

When run without `--skip-signals`, the signal refresh also runs
`lead:signal-sweep` after forms/events/Marketplace/Creem monitor inputs. That
step does not access Gmail directly; it checks whether a same-day read-only
Gmail sweep has been logged and prints the query pack to run with the Gmail
connector before judging replies, revenue, or follow-up readiness.

Use the step-by-step commands below when debugging a stage:

```bash
pnpm lead:checkout-origin
pnpm lead:public-health
pnpm lead:portfolio
pnpm lead:portfolio-experiments
pnpm lead:asset-kits
pnpm lead:landing-baseline
pnpm lead:landing-target-decision
pnpm lead:asset-coverage
pnpm lead:landing-baseline-brief
pnpm lead:creem-links
pnpm lead:creem-store-verification
pnpm lead:signal-sweep
pnpm lead:owned-sites
pnpm lead:creem-links
pnpm lead:owned-site-cta
pnpm lead:plugin-channel-fit
pnpm lead:cross-promo
pnpm lead:owned-site-implementation
pnpm lead:use-case-pages
pnpm lead:use-case-page-package
pnpm lead:publish-preflight
pnpm lead:customer-feedback
pnpm lead:customer-feedback-brief
pnpm lead:customer-feedback-review
pnpm lead:confirmations
pnpm lead:action-time-packet
pnpm lead:experiment-decisions
pnpm lead:goal-coverage
pnpm lead:executive
pnpm lead:action-review
pnpm lead:gate
pnpm lead:channel-priority
pnpm lead:partners
pnpm lead:today
pnpm lead:ops
```

For the weekly portfolio report, run:

```bash
pnpm lead:checkout-origin
pnpm lead:public-health
pnpm lead:portfolio
pnpm lead:portfolio-experiments
pnpm lead:asset-kits
pnpm lead:landing-baseline
pnpm lead:asset-coverage
pnpm lead:landing-target-decision
pnpm lead:landing-baseline-brief
pnpm lead:owned-sites
pnpm lead:creem-links
pnpm lead:owned-site-cta
pnpm lead:plugin-channel-fit
pnpm lead:customer-feedback
pnpm lead:customer-feedback-brief
pnpm lead:customer-feedback-review
pnpm lead:use-case-page-package
pnpm lead:publish-preflight
pnpm lead:confirmations
pnpm lead:experiment-decisions
pnpm lead:goal-coverage
pnpm lead:executive
pnpm lead:action-review
pnpm lead:gate
pnpm lead:channel-priority
pnpm lead:partners
pnpm lead:portfolio-weekly
```

This writes `.tmp/framer-portfolio-weekly-report.md/json` and maintains
`tools/lead-finder/partners.local.csv`. The weekly report is the portfolio-level
view: per-plugin users/opens/revenue/reply signals, channel keep/stop status,
the plugin/channel fit matrix, the next three growth actions,
confirmation-gated external actions, partner log health, and current risks.

`lead:asset-kits` writes `.tmp/framer-plugin-asset-kits.md/json` plus one
per-plugin file under `docs/growth/assets/`. These are local review packs for
Marketplace copy, screenshot/video storyboard, FAQ, landing page outline,
Community post, directory description, partner pitch, customer template, demo
angle, SEO/AEO article angle, tracking plan, and safety gate. They are not
publishing instructions; external use still requires confirmation.

`lead:asset-coverage` writes `.tmp/framer-asset-coverage.md/json`. It checks
each plugin against the growth system requirements: per-plugin profile,
Marketplace kit, Community post angle, directory copy, partner pitch, customer
loop, demo/SEO angle, tracking, landing baseline, experiment/review loop, safety
confirmation, and evidence. The ops dashboard includes the short coverage
matrix; use the standalone report for detailed check reasons.

`lead:plugin-channel-fit` writes `.tmp/framer-plugin-channel-fit.md/json`. It
turns portfolio facts, asset coverage, landing targets, customer feedback, and
review queues into a plugin-by-channel routing matrix across existing customer,
Marketplace, owned landing/SEO, Framer Community, directories, partner content,
agency outreach, and cross-promotion. It is local-only; external rows still need
the confirmation phrase shown by `lead:today` or the relevant action brief.

`lead:cross-promo` writes `.tmp/framer-cross-promotion-matrix.md/json`. It
turns the four owned plugin sites into a related-plugin promotion matrix across
owned sites, docs, tutorial endings, and success-page-style placements. Rows are
classified as ready local copy, prepare-only, blocked by checkout, or blocked by
Creem/compliance; every external site update still requires the exact
confirmation phrase and action-log evidence.

`lead:owned-site-implementation` writes
`.tmp/framer-owned-site-implementation-brief.md/json` plus per-plugin briefs
under `docs/growth/owned-site-implementation/`. It combines landing baseline,
tracked Marketplace CTA, cross-promotion rows, record commands, verification
commands, risks, benefits, and exact confirmation phrases into a practical
site-update packet. It does not deploy or edit any owned site.

`lead:owned-site-drop-patch` writes
`.tmp/framer-owned-site-drop-patches.md/json` plus local HTML/snippet files
under `.tmp/framer-owned-site-drop-patches/`. It fetches the current ready
owned pages, injects a tracked Framer Marketplace CTA section and the first safe
related-plugin link, then saves a local preview/patch package. It is useful for
Netlify Drop-style sites where the source files are not in this repo. It does
not deploy, upload, replace, or publish anything; use the exact confirmation
phrase and rerun owned-site audits before recording a live action.

`lead:use-case-pages` writes `.tmp/framer-use-case-page-brief.md/json` plus
per-plugin briefs under `docs/growth/use-cases/`. It turns each owned plugin
site into a searchable page plan with URL, keyword, title, outline, tracked
Marketplace CTA, UTM campaign, related-plugin links, record command, and
verification commands. It is local-only: Loka and Polyglot remain prepare-only
while payment/compliance gates are open, and Ally/Gaode publishing still needs
the exact confirmation phrase.

`lead:use-case-page-package` writes
`.tmp/framer-use-case-page-packages.md/json` plus local HTML/copy/link files
under `.tmp/framer-use-case-page-packages/`. It turns ready use-case briefs
into previewable standalone pages with canonical URL, meta description,
structured data, tracked Framer Marketplace CTA, related-plugin link, record
command, and verification commands. It is useful for Netlify Drop-style sites
or manual page creation, but it does not deploy, upload, replace, or publish
anything. Blocked Loka/Polyglot pages are held until payment/compliance gates
clear.

`lead:publish-preflight` writes `.tmp/framer-publish-preflight.md/json`. It
checks ready owned-site patch files and use-case page packages before any
external publish: local files exist, hashes are recorded, canonical URLs and
structured data are present, Framer Marketplace CTAs include the expected UTM
campaign, generated snippets avoid direct Creem checkout links, and every
asset has a matching confirmation-queue row. Full homepage previews may inherit
existing direct Creem links from the live site; those appear as warnings so the
store/domain can be checked before scaling traffic. This script is local-only
and never deploys, uploads, edits Creem, or publishes pages.

`lead:landing-baseline` writes `.tmp/framer-landing-baseline.md/json` and
per-plugin specs under `docs/growth/landing-baselines/`. It turns the asset kit
and public-health gaps into a small landing/tutorial page plan: proposed URL,
headline, sections, tracked Marketplace CTA, UTM campaign, expected events,
acceptance criteria, and exact confirmation phrase. It does not deploy or
publish anything. It reads `tools/lead-finder/landing-targets.local.csv` as the
persistent per-plugin landing URL registry; leave `target_url` blank with
`needs_decision` until an owned URL is chosen, then rerun `pnpm lead:portfolio-ops`
to refresh the brief and coverage reports.

`lead:landing-target-decision` writes
`.tmp/framer-landing-target-decision.md/json`. It reads the landing baseline,
target registry, asset coverage, channel fit, and deploy/Netlify status, then
shows which plugins still need a concrete owned landing URL. It suggests
candidate URL strategies and registry update hints, but it does not edit
`tools/lead-finder/landing-targets.local.csv`, deploy, publish, or create
traffic. Use it before filling a blank `target_url` for Ally Auditor, Gaode
Maps, or any future plugin.

`lead:landing-baseline-brief` writes
`.tmp/framer-landing-baseline-brief.md/json`. It selects the next ready landing
baseline row and turns it into an action-time confirmation packet with action,
target, risk, expected benefit, exact confirmation phrase, preconditions,
record command, verification commands, and same-day/24h/7d/14d review schedule.
If the target still contains `<owned-domain>`, the brief blocks deployment until
you rerun it with `--owned-domain` or `--target-url`.

`lead:owned-sites` writes `.tmp/framer-owned-site-audit.md/json`. It fetches
the owned-site registry, checks HTTP status, first-page brand fit, Framer
Marketplace CTA links, UTM tracking, forms, direct Creem links, and legacy
checkout hosts. Use it to decide whether a site can safely receive traffic or
whether it needs CTA/tracking work first. It is read-only and does not deploy or
change site content.

`lead:creem-links` writes `.tmp/framer-creem-link-inventory.md/json`. It builds
a portfolio-level matrix of direct Creem payment links across the owned plugin
sites, extracts product IDs, checks open compliance-warning rows, notes local
approval/closure evidence, and separates blocked compliance/checkout surfaces
from ready sites that still need store/domain verification before traffic is
scaled. It is read-only and does not change Creem, payment links, websites, or
email.

`lead:creem-store-verification` writes
`.tmp/framer-creem-store-verification-brief.md/json`. It turns
`needs_store_domain_verification` rows from the Creem link inventory into a
manual read-only dashboard checklist: expected owned domain, product IDs,
fields to inspect in Creem, evidence required, risk/benefit, and the action-log
command to run after verification. It also keeps Loka-style compliance warnings
separate from Ally/Gaode store-domain checks. It is local-only and does not log
into Creem, change payment settings, send email, or deploy sites.

`lead:owned-site-cta` writes `.tmp/framer-owned-site-cta-kit.md/json`. It turns
the owned-site audit and landing baseline into exact tracked Marketplace CTA
URLs, button labels, copy, HTML snippets, verification commands, confirmation
phrases, and action-log record commands. It is local-only; blocked rows such as
payment-compliance or checkout-origin issues are preparation-only until their
gate clears.

`lead:customer-feedback` writes `.tmp/framer-customer-feedback-queue.md/json`.
It reads real external payments from `tools/lead-finder/revenue.local.csv`,
matches them to portfolio experiments, and prepares customer feedback drafts
without creating Gmail drafts or sending email. Ready rows still require the
exact confirmation phrase; rows tied to open payment compliance risk stay held.

`lead:customer-feedback-brief` writes
`.tmp/framer-customer-feedback-brief.md/json`. It selects the next ready
customer feedback row and turns it into an action-time confirmation packet:
target, risk, expected benefit, exact confirmation phrase, verification, draft
text, action-log record command, Gmail review query, and 24h/48h/72h/7d review
schedule. It does not create drafts or send email.

`lead:customer-feedback-review` writes
`.tmp/framer-customer-feedback-review.md/json`. It reads confirmed Gmail
customer feedback sends from `tools/lead-finder/actions.local.csv` and local
review rows from `tools/lead-finder/customer-feedback-reviews.local.csv`, then
shows which 24h/48h/72h/7d checks are due. It does not search Gmail, create
drafts, or send email; after a read-only Gmail check, record the outcome with
the `--record-review` command printed in the report.

`lead:confirmations` writes `.tmp/framer-confirmation-queue.md/json`. It
consolidates confirmation-gated actions from Today, portfolio experiments,
plugin channel fit, customer feedback, landing baseline, owned-site
implementation, landing target decisions, and blocker briefs into one queue. It deduplicates repeated
confirmation phrases, separates `ready_confirmation_required` from
`needs_decision`, `waiting_provider`, and `blocked`, and identifies the one next
confirmation phrase that is actually actionable. It never sends, publishes,
deploys, submits, uploads, or changes payment settings.

`lead:action-time-packet` writes `.tmp/framer-action-time-packet.md/json`. It
turns the ready confirmation queue into a one-page execution packet with action,
target, risk, expected benefit, exact confirmation phrase, verification, record
command, review windows, and any local assets such as Gmail draft preview,
owned-site patch files, or use-case page packages. It is not an executor; it is
the last local review surface before a user-confirmed external action.

`lead:executive` writes `.tmp/framer-growth-executive-brief.md/json`. It is the
short daily operator view: current proof, the one action to do first, safe local
work, confirmation queue, do-not-do-yet blockers, per-plugin snapshot, checkout
gate, and the next refresh commands. It reads existing reports only and is meant
to be opened before the full ops dashboard when deciding what to do today.

`lead:experiment-decisions` writes
`.tmp/framer-experiment-decision-brief.md/json`. It merges the portfolio
experiment log, confirmation queue, public action review, and plugin/channel fit
matrix into a daily decision table: ready confirmation, needs decision, waiting
provider, blocked, planned, review due, scale candidate, or stop/rework. Each
row includes the continue rule, stop/rework rule, scale rule, review command,
record command when available, and exact confirmation phrase. It is local-only
and exists to make every channel decision evidence-based instead of ad hoc.

`lead:goal-coverage` writes `.tmp/framer-growth-goal-coverage.md/json`. It
audits the long-running growth objective requirement by requirement: plugin
profiles, daily fact refresh, priority ranking, promotion assets, owned
landing/tracking, experiment loops, channel system, weekly report, confirmation
gates, and real growth signals. Treat `partial` or `missing` rows as work still
required; this report is the guardrail against marking the long-running goal
complete from weak evidence.

`lead:public-health` writes `.tmp/framer-public-health.md/json`. It fetches
each plugin's public Marketplace page plus recorded landing, pricing, checkout,
and health URLs. Use it before `lead:portfolio` so every per-plugin growth file
shows whether the public surface is ready for promotion, blocked by checkout or
compliance, or missing a dedicated landing/tracking baseline.

`tools/lead-finder/landing-targets.local.csv` is the owned-site registry used by
landing baselines and public health. Current owned roots are:
`https://polyglotaeo.com/`, `https://allyauditor.com/`,
`https://getloka.dev/`, and `https://gaodemaps.com/`. A concrete owned URL does
not by itself remove payment/compliance gates; Loka and Polyglot can still be
blocked even when their sites return 200.

For the active Loka compliance experiment, run:

```bash
pnpm lead:loka-checkout
```

It fetches `getloka.dev`, searches local developer projects for Loka/Creem
checkout surfaces, and writes `.tmp/loka-checkout-origin-inventory.md/json`.
This is a local evidence packet only; do not change Creem or payment routing
until Creem identifies the exact offending origin/referrer.

When payment recovery says the next action is the Cloudflare Worker custom
domain, use the confirmation-gated apply wrapper instead of running Wrangler by
hand:

```bash
pnpm lead:cloudflare-apply -- --dry-run
pnpm lead:cloudflare-apply -- --confirm '确认部署 Cloudflare Worker custom domain'
```

The apply wrapper refuses to deploy without the exact confirmation phrase, then
runs Wrangler deploy, `/health`, checkout-origin readiness, payment recovery,
and Marketplace preflight before writing `.tmp/framer-cloudflare-apply.md/json`.

If the sample has enough sent leads but no replies or public intent, the gate
sets the cold Day 0 cap to zero and prioritizes Marketplace/community/directory
distribution before more cold outreach.

For Framer Community specifically, generate the post kit and review whether it
is producing real intent:

```bash
pnpm lead:community
pnpm lead:community-lint
pnpm lead:payment-compliance-recovery
pnpm lead:community-preflight
pnpm lead:community-brief
pnpm lead:community-review
```

Do not publish unless `lead:community-preflight` says `Publish allowed: yes`.
It now reads the payment compliance recovery gate, so an open Creem warning,
broken checkout origin, or unavailable Worker custom domain blocks Community
even if the copy and visual lint pass. Then run `lead:community-brief` to turn
the kit, lint, preflight, payment gate, Marketplace baseline, and review state
into a go/no-go launch brief with the selected post, blockers, publishing
commands, and 24h/48h/72h/7d review schedule. After publishing, record the post
URL with the command printed in the kit, then rerun the review after 24, 48,
and 72 hours. Use `--comments` and `--dms` for manual signals that do not
appear in Netlify tracking. A zero-signal 72h read deprioritizes Community
behind Marketplace, directory, and partner/resource channels until the hook or
visual angle is materially changed.
The priority 1 Community post is Marketplace-native while production tracking is
stale: its first link points to the Framer Marketplace listing so Creator Space
users/opens can prove whether Community is worth continuing.

The shortest safe record path is:

```bash
pnpm lead:public-preflight
pnpm lead:deploy-review
pnpm lead:community-brief
pnpm lead:marketplace-record -- --plugin-zip plugin.zip --evidence '<framer-upload-confirmation-url-or-screenshot>'
pnpm lead:community-record -- --url "https://www.framer.com/community/..."
pnpm lead:forms && pnpm lead:events && pnpm lead:marketplace-public -- --record && pnpm lead:community-review && pnpm lead:gate && pnpm lead:ops
```

## 1. Discover prospects

Search with the queries in:

```text
tools/lead-finder/framer-search-queries.txt
```

Copy raw result snippets or URL lists into a local file:

```text
tools/lead-finder/search-results.local.txt
```

Extract, score, de-risk, and dedupe prospects:

```bash
pnpm lead:discover -- --input tools/lead-finder/search-results.local.txt --append-to tools/lead-finder/framer-prospects.local.txt
```

Discovery outputs:

```text
.tmp/framer-prospects-discovered.txt
.tmp/framer-prospects-discovered.csv
```

The text file feeds `lead:find`. The CSV shows scoring signals, template/demo
risk, and the recommended next step.

## 2. Collect prospects

Create a local file that is never committed:

```bash
cp tools/lead-finder/framer-prospects.example.txt tools/lead-finder/framer-prospects.local.txt
```

Add one URL per line. Keep it small and intentional: agencies, creator portfolios,
Framer sites with locale paths, and published customer sites.

## 3. Scan AEO pain

```bash
pnpm lead:find -- --input tools/lead-finder/framer-prospects.local.txt
```

The scanner retries transient fetch failures by default. Increase the timeout
only for slow sites:

```bash
pnpm lead:find -- --input tools/lead-finder/framer-prospects.local.txt --timeout-ms 20000 --retries 3
```

Default output:

```text
.tmp/framer-leads.csv
```

Key fields:

- `is_framer`: true when public HTML has enough Framer signals.
- `is_multilingual`: true when locale paths, hreflang, or multiple locale hints are found.
- `pain_score`: prioritization score. Start with `>= 70`.
- `outreach_angle`: the single strongest reason to inspect the lead manually.
- `contact_email`: email extracted from the homepage or contact/about page.
- `contact_page`: the contact/about page inspected for email enrichment.
- `notes`: scanner caveats. Do not outreach from blocked or uncertain rows without opening the site.

## 4. Generate mini audits

```bash
pnpm lead:outreach -- --input .tmp/framer-leads.csv --limit 10
```

Default outputs:

```text
.tmp/framer-outreach.md
.tmp/framer-outreach.csv
```

The outreach generator defaults to strict mode:

- Framer confirmed.
- Multilingual confirmed.
- `pain_score >= 70`.
- One draft per domain, keeping the highest-score row.
- Contact channel marked as `email`, `contact_page`, or `manual`.
- Contact-page leads include a shorter form message plus the email fallback.

Use `--include-single-locale` only for manual research queues. Use
`--include-nonframer` only for debugging scanner quality.

## 5. Manual send rule

Every generated draft is a starting point, not a message to blast.

Before sending:

1. Open the live site.
2. Confirm it is a real business, agency, founder site, or maker portfolio.
3. Confirm at least one issue from the mini audit.
4. Personalize the first line with the actual company, person, or page.
5. Stop after the Day 10 follow-up if there is no reply.

## 6. Track outreach

Import reviewed drafts into a local CRM:

```bash
pnpm lead:crm -- --import .tmp/framer-outreach.csv
```

Default CRM:

```text
tools/lead-finder/outreach.local.csv
```

Today's action plan:

```text
.tmp/framer-actions.md
```

After sending the first email:

```bash
pnpm lead:crm -- --domain example.com --set-status sent_day_0
```

The CRM schedules Day 3 and Day 10 follow-ups automatically:

```bash
pnpm lead:crm -- --summary
```

When a reply becomes a real opportunity, record the revenue path and optional
deal value:

```bash
pnpm lead:crm -- --domain example.com --set-status service_offer --revenue-path launch_qa --deal-value 750 --note "asked for implementation scope"
```

If revenue appears outside the outreach CRM, such as a Creem sale email or a
manual service payment, record it in the local revenue ledger. Use `pending`
until the amount/customer is verified:

```bash
pnpm lead:revenue -- --source creem --status pending --product "Polyglot AEO" --email-id 19f12902f31ad441 --note "Gmail subject: You made a sale!"
```

After checking the payment details, update the same event:

```bash
pnpm lead:revenue -- --source creem --status verified --amount-usd 190 --product "Polyglot AEO" --email-id 19f12902f31ad441 --revenue-path plugin
```

## 7. Verify before sending

Before sending Day 0, run:

```bash
pnpm lead:verify
```

Default output:

```text
.tmp/framer-verification.md
```

Only send rows marked `send_ready`. If a row is ready, mark it:

```bash
pnpm lead:crm -- --domain example.com --set-status verified --note "lead:verify send_ready"
```

If the verifier recommends `manual_review`, pause the lead so it does not stay
in today's send queue:

```bash
pnpm lead:crm -- --domain example.com --set-status manual_review --note "lead:verify manual_review"
```

Then send Day 0 and update:

```bash
pnpm lead:crm -- --domain example.com --set-status sent_day_0
```

## 8. Reply with a mini audit

When a lead replies, mark it and generate the promised 3-point mini audit:

```bash
pnpm lead:crm -- --domain example.com --set-status replied --note "asked for mini audit"
pnpm lead:audit -- --status replied
```

Default output:

```text
.tmp/framer-mini-audits.md
```

After sending the mini audit, use the command printed under that lead to mark
`mini_audit_sent` and track the likely Pro conversion value.

## 9. Generate a send pack

After verification, generate copy-ready emails and mini-audit notes:

```bash
pnpm lead:sendpack
```

Outputs:

```text
.tmp/framer-send-pack.md
.tmp/framer-send-pack.html
.tmp/framer-send-pack/*.txt
.tmp/framer-send-pack/*.eml
```

Open `.tmp/framer-send-pack.html` in a browser to review evidence and use the
mailto/EML/TXT links. Open each live site once more before sending.
Manual mailto/EML mark-sent commands preserve the actual copy variant, such as
`agency-handoff-v2`, so copy-experiment reporting stays accurate even when the
Gmail connector is unavailable.

When using the Gmail connector, prefer a draft-first send flow:

1. Create the Gmail draft.
2. Send that draft.
3. Update CRM only after `send_draft` returns a `SENT` message id.

If draft creation succeeds but sending fails with a connector transport error,
do not mark the lead as sent. Keep the draft id and retry the existing draft or
confirm it manually in Gmail.

When the connector is flaky or a pack was only partially sent, generate the
Gmail queue before the next attempt:

```bash
pnpm lead:site-check
pnpm lead:tracking-freshness
pnpm lead:netlify-recovery
pnpm lead:netlify-apply -- --dry-run
pnpm lead:gmail-queue
```

For first-touch leads already promoted into the `queued` status, the queue
uses `.tmp/framer-queued-pack` automatically:

```bash
pnpm lead:sendpack -- --status queued --variant value-first --due-only --output .tmp/framer-queued-pack.md --html .tmp/framer-queued-pack.html --out-dir .tmp/framer-queued-pack --mark-sent .tmp/framer-mark-queued.sh
pnpm lead:gmail-queue -- --status queued --limit 4 --output .tmp/framer-queued-gmail-queue.md --json .tmp/framer-queued-gmail-queue.json
```

Do not continue sending if `lead:site-check` fails. It checks that the public
`/audit/` page is live, contains the Netlify form markers used by the outreach
CTA, confirms the `/audit/sample/` report example and `/agency/` handoff page
are reachable, and verifies the registered Netlify form when a token is
available.

Run `lead:tracking-freshness` before broad Marketplace follow-on traffic,
Framer Community posts, or directory submissions. It fetches production pages,
`/__forms.html`, and the linked Next.js chunks to confirm first-touch
attribution persistence, Netlify form schemas, and checkout event fields are
actually deployed. Use `pnpm lead:tracking-freshness -- --strict` as a hard
gate when deciding whether the live site is fresh enough for a public push.

Run `lead:local-tracking-freshness` after `pnpm --dir polyglotaeo-web build`
when production is stale. It reads `polyglotaeo-web/out`, local Netlify form
declarations, and local `_next/static` chunks to prove whether the static export
is ready for a confirmed deploy.

Run `lead:netlify-recovery` when production tracking is stale or Netlify deploys
appear blocked. It performs only read-only checks: token presence, Netlify site
readability, latest deploy, registered Forms, public URLs, local build freshness,
and the current deploy-blocker evidence. It does not create a deploy.

Run `lead:netlify-apply -- --dry-run` before asking for a production deploy. It
refreshes the read-only Netlify, local tracking, checkout-origin, and deploy
review evidence, then reports whether a confirmed deploy is locally safe. The
actual deploy is guarded by the exact confirmation
`确认部署 polyglotaeo-web 到 Netlify`; without that phrase it does not build,
deploy, or write an action-log row.

Outputs:

```text
.tmp/framer-gmail-queue.md
.tmp/framer-gmail-queue.json
```

Process `send_existing_draft` items first, then `create_draft_then_send` items.

For scheduled follow-ups, generate a due-only pack for the status that is due.
Start with the read-only readiness gate so the dashboard and operator agree on
whether the batch is merely prepared, actually due, missing same-day Gmail
preflight evidence, or safe to send:

```bash
pnpm lead:day3-readiness
```

Default outputs:

```text
.tmp/framer-day3-readiness.md
.tmp/framer-day3-readiness.json
```

This command does not send email or mutate CRM rows. It reads the CRM, the
prepared Gmail queue, the action log, and `lead:followup-preflight`, then prints
the exact next safe command. A Day 3 queue is only send-ready when the target
date is today, the queue matches the due CRM rows, same-day Gmail
reply/bounce/unsubscribe/revenue preflight has been logged, and follow-up
preflight says `send_allowed`.

After generating the queue and readiness report, build the operator brief:

```bash
pnpm lead:day3-brief
```

Default outputs:

```text
.tmp/framer-day3-send-brief.md
.tmp/framer-day3-send-brief.json
```

This is still read-only. It does not create Gmail drafts, send messages, or
update CRM rows. It packages the send-date Gmail search queries for replies,
bounces, unsubscribes, and revenue signals, plus the queue sample, review
commands, and stop rules that must pass before touching Gmail sends.

For example, Day 3 follow-ups on 2026-07-03:

```bash
pnpm lead:sendpack -- --status sent_day_0 --today 2026-07-03 --due-only --output .tmp/framer-day3-pack.md --html .tmp/framer-day3-pack.html --out-dir .tmp/framer-day3-pack --mark-sent .tmp/framer-mark-day3.sh
pnpm lead:gmail-queue -- --status sent_day_0 --sendpack-dir .tmp/framer-day3-pack --output .tmp/framer-day3-gmail-queue.md --json .tmp/framer-day3-gmail-queue.json
pnpm lead:day3-brief -- --today 2026-07-03
```

Day 3 follow-ups intentionally turn CRM findings into short `Observed` / `Fix`
items. Agency follow-ups point to the `/agency/#template` client handoff page
and ask for one active Framer client URL, so the reply path is a concrete QA
deliverable instead of a generic product pitch.

`lead:gmail-queue` requires a fresh `.sendpack-manifest.json` written by
`lead:sendpack`, and rejects packs older than 15 minutes by default. This keeps
Gmail queues from accidentally reading stale copy after template or follow-up
changes. Use `--allow-stale-sendpack` only for deliberate manual recovery.
Use `--limit` for controlled retry batches after a connector failure.
The queue also inherits each file's actual copy variant from the manifest, such
as `agency-handoff`, and generates a 30-day sent-mail duplicate check before
you send or update the CRM.

`lead:gmail-queue` infers the CRM status after a confirmed send:
`sent_day_0` queues update to `sent_day_3`, and `sent_day_3` queues update to
`sent_day_10`. Pending Gmail drafts are only reused for Day 0 queues by
default, so stale first-touch drafts are not accidentally sent as follow-ups.

When the first-touch reply rate is weak, test the value-first Day 0 copy on
reserved leads. It gives two public findings up front and records the variant
in CRM notes after sending. Day 0 links now point to
`https://polyglotaeo.com/audit/?utm_source=outreach&utm_campaign=...` so clicks
land on the mini-audit request page instead of the generic homepage:

```bash
pnpm lead:verify -- --status reserve --output .tmp/framer-verification-reserve.md
pnpm lead:sendpack -- --status reserve --variant value-first --verify .tmp/framer-verification-reserve.md --output .tmp/framer-value-first-reserve-pack.md --html .tmp/framer-value-first-reserve-pack.html --out-dir .tmp/framer-value-first-reserve-pack --mark-sent .tmp/framer-mark-value-first-reserve.sh
```

If only part of a reserve pack was actually sent, do not run the generated
batch mark-sent script. Update only confirmed sends:

```bash
pnpm lead:crm -- --domain example.com --set-status sent_day_0 --note "outreach variant:value-first; gmail sent id 19f..."
```

## 10. Weekly report

Every Friday, generate a funnel report:

```bash
pnpm lead:report
```

Default output:

```text
.tmp/framer-weekly-report.md
```

The report tracks sent leads, replies, install/service opportunities, due
follow-ups, contact channels, CTA intent, external action logs, Marketplace
snapshot movement, production and local tracking freshness, revenue ledger
events, copy experiments, Framer Community review status, and the next
operational action. When production tracking is stale but local tracking is
fresh, treat the website code as ready and the remaining blocker as deploy
access plus explicit deploy confirmation.

## 11. Gmail monitor pack

Generate exact Gmail searches for replies, bounces, and Creem revenue events:

```bash
pnpm lead:monitor
```

Default output:

```text
.tmp/framer-gmail-monitor.md
```

Use this before sending scheduled follow-ups so bounced or replied leads do not
receive the next sequence email.

For the shorter daily signal check, refresh the local counters and generate the
read-only Gmail query pack:

```bash
pnpm lead:forms && pnpm lead:events
pnpm lead:marketplace-public -- --record
pnpm lead:tracking-freshness
pnpm lead:netlify-recovery
pnpm lead:netlify-apply -- --dry-run
pnpm lead:signal-sweep
pnpm lead:partner-review
```

`lead:signal-sweep` does not read or change Gmail directly. It combines the
latest local form/event/revenue/Marketplace state, checks whether a same-day
Gmail signal sweep has been logged, and prints the exact Gmail searches plus the
action-log template to use after the read-only mailbox sweep.

Use `lead:partner-review` after content-partner pitches, Gmail-based directory
submissions, or Framer visibility requests. It reads the action log plus local
CTA/form data, builds a Gmail reply query, and schedules 3/7/14 day review
checkpoints so resource/backlink opportunities do not disappear after the
first email.

Pull Netlify Forms directly so a mini-audit request does not depend on the
notification email arriving:

```bash
pnpm lead:forms
pnpm lead:forms -- --apply
pnpm lead:events
pnpm lead:action-review
pnpm lead:distribution
pnpm lead:community
pnpm lead:directory
pnpm lead:directory-record -- --campaign frameplate_plugin --evidence '<submission-confirmation-or-screenshot>'
pnpm lead:directory-review
pnpm lead:partner-review
pnpm lead:actions
pnpm lead:marketplace
pnpm lead:ops
```

Default outputs:

```text
.tmp/framer-form-intake.md
.tmp/framer-form-intake.json
.tmp/framer-cta-events.md
.tmp/framer-cta-events.json
```

`lead:forms` reports submissions by default. Use `--apply` after review to call
`lead:intake` for every new submission.
Submissions from `/agency/` carry `request_type=agency_template`; intake keeps
them in the mini-audit reply queue but records `source=agency_page`,
`revenue_path=launch_qa`, and a service estimate so the opportunity is visible
in reports after the 3-point handoff note is sent. Use `lead:handoff` for
these requests because it turns the public scan into an agency-style handoff
note with observation, client risk, and first fix columns.
Submissions from `/llms-txt/` carry `request_type=llms_txt_check`; intake
records `source=llms_txt_page`, `revenue_path=plugin_pro`, and the Pro plan
value so this organic entry point can be measured separately.
`lead:events` reads the lightweight Netlify `framer-aeo-event` form used by
install and checkout CTA links. It reports install intent, checkout intent,
source paths, and UTM campaigns without relying on third-party analytics.
Plugin upgrade buttons route through `/go/checkout/` first, so checkout events
also include the Pro gate reason when the click started inside the Framer
plugin.
`lead:action-review` creates `.tmp/framer-action-review.md/json` from the
external action log and current forms/events/Marketplace snapshots. Use it
after Marketplace uploads, owned landing baseline publishes, Community posts,
generic public posts, or directory submissions so same-day/24h/48h and 7d/14d
review windows do not live only in memory.
`lead:ops` combines CRM status, revenue ledger, Netlify form/event intake,
Gmail queue state, and the current `plugin.zip` release gate into
`.tmp/framer-growth-ops.md`. Use it as the daily cockpit before sending or
uploading anything. It also reads `.tmp/framer-today.json`, so the top of the
cockpit reflects the current execution plan instead of only raw channel scores.
`lead:deploy-review` reads the latest Netlify deploy diagnosis, site-check
state, forms, events, and action log. It does not create a deploy; use it to
keep account-credit blockers and production-site health visible in `lead:ops`.
`lead:tracking-freshness` creates `.tmp/framer-tracking-freshness.md/json` from
production HTML, Netlify form declarations, and linked JS bundles. It separates
"site is reachable" from "latest attribution/checkout tracking is actually
deployed," which matters before Community and directory traffic.
`lead:local-tracking-freshness` creates
`.tmp/framer-local-tracking-freshness.md/json` from the local static export, so
deploy readiness can be proven before asking for explicit production deploy
confirmation.
`lead:netlify-recovery` creates `.tmp/framer-netlify-recovery.md/json` from
read-only Netlify API calls and production URL checks. Use it after billing or
permission changes to prove login/project/site access before requesting explicit
deploy confirmation.
`lead:netlify-apply` creates `.tmp/framer-netlify-apply.md/json`. Dry-run mode
is read-only; confirmed mode builds `polyglotaeo-web`, deploys the static export
through the Netlify API, runs site/tracking/checkout/payment/Marketplace
postchecks, and records a local `web_deploy` action.
`lead:next-public-actions` creates `.tmp/framer-next-public-actions.md/json`
from public preflight plus Marketplace, Community, directory, deploy, and gate
reviews. The Marketplace card also embeds the current
`.tmp/framer-marketplace-update.md` Changes text, upload path, and after-submit
commands so the confirmation brief is directly executable.
`lead:channel-priority` creates `.tmp/framer-channel-priority.md/json` by
ranking Marketplace, Community, directories, distribution posts, follow-ups,
cold expansion, deploy, and monitoring from the current gate/review evidence.
Use it when deciding which growth channel deserves the next confirmed action
and which channels should be paused or held for measurement.
`lead:launch-console` creates `.tmp/framer-launch-console.html`, a local
execution console for Marketplace upload, Framer Community copy, directory
submission fields, deploy status, and the after-action record commands. Refresh
it after `pnpm release:marketplace-brief` so the Marketplace section contains
the exact zip path, Changes copy, and evidence-bearing record commands.
`lead:distribution` creates `.tmp/framer-distribution-kit.md/json` with UTM
links and ready-to-post copy for the `/agency/`, `/llms-txt/`, and `/audit/`
entry points. Use it when Gmail is unavailable or when the funnel has no CTA
events yet. Each post includes the matching `lead:actions -- --add` command to
run after publishing, so attribution stays tied to the exact post or DM.
`lead:community` creates `.tmp/framer-community-feed-kit.md/json` with
Framer Community-specific posts, reply templates, guardrails, and measurement
commands. Use it for the official Community feed because the copy should read
like a useful question or launch-QA discussion first, not a generic social ad.
The Community experiment uses 24h, 48h, and 72h review points so the team can
distinguish "worth continuing" from "rewrite or deprioritize" before posting
lower-priority content.
`lead:community-brief` creates `.tmp/framer-community-launch-brief.md/json` as
the operator-facing launch decision: whether Community is worth one controlled
test, why publishing is blocked or allowed, which priority post to use, the
exact record command, and the post-review schedule.
`lead:directory` creates `.tmp/framer-directory-submit-kit.md/json` with
Frameplate, Frameplugins, and HyperFramer submission targets plus reusable
listing copy. Use it for long-lived discovery surfaces. Third-party form
submissions still require explicit action-time confirmation before submitting.
`lead:directory-record` records a confirmed directory submission into
`tools/lead-finder/actions.local.csv` with duplicate protection and 7/14 day
review dates. Use it right after a manually confirmed directory form submit,
for example `pnpm lead:directory-record -- --campaign frameplate_plugin
--evidence '<submission-confirmation-or-screenshot>'`.
`lead:directory-review` creates `.tmp/framer-directory-review.md/json` by
combining the directory kit, action log, CTA events, and form intake. Use it
after any directory submission or email pitch so the ops dashboard can tell
whether to submit one more target, wait, or fulfill directory-sourced intent.
`lead:actions` records external actions such as Marketplace uploads, social
posts, partner DMs, compliance warnings, and manual sends in
`tools/lead-finder/actions.local.csv`. Use `type=compliance_warning` with
`status=needs_action` for payment, Marketplace, or policy blockers; record a
follow-up action with `status=resolved` once the provider dashboard or support
thread confirms it is closed.
Use it whenever an action happens outside the CLI so later CTA/form/revenue
signals can be attributed to the right push.
`lead:creem-compliance` creates `.tmp/framer-creem-compliance-review.md/json`
from open Creem warnings, checkout-origin readiness, Cloudflare recovery,
payment recovery, and Marketplace preflight. Use it before checkout-heavy
pushes; it includes the approved-domain checklist, a Creem evidence packet, an
initial support draft, a closure follow-up draft, and the exact
`lead:actions -- --add` command to mark the warning resolved after Creem
confirms closure.
`lead:checkout-origin` creates `.tmp/framer-checkout-origin-readiness.md/json`
and verifies the whole checkout-origin migration: plugin package, local static
export, Worker custom-domain config, public DNS routability, production pricing
page, production checkout bridge, Worker `/health`, and open Creem warnings.
Run it before Marketplace upload, Community posts, directory submissions, or
paid traffic. Treat reserved DNS results such as `198.18.0.0/15` as blockers
for the production checkout origin even if the hostname technically resolves.
`lead:cloudflare-recovery` creates `.tmp/framer-cloudflare-recovery.md/json`
from read-only Wrangler, DNS, and `/health` evidence. Use it when the Worker
custom domain is the first payment-compliance blocker; it checks the local
custom-domain config, recent Cloudflare deployments/versions, required Worker
secrets, public DNS routability, and the custom-domain health endpoint without
deploying anything.
`lead:payment-compliance-recovery` creates
`.tmp/framer-payment-compliance-recovery.md/json` by combining Creem
compliance, checkout-origin readiness, Netlify recovery, deploy review, and
Marketplace preflight. Use it as the no-side-effect recovery runbook when
payment compliance blocks promotion; it separates read-only checks from
confirmation-gated Cloudflare deploy, Netlify deploy, Creem closure, and
Marketplace upload commands.
`lead:blocker-brief` creates `.tmp/framer-blocker-resolution-brief.md/json` as
the compact operator brief for those blockers: what is ready for confirmation,
what is still externally blocked, which command/evidence proves each step, and
which public actions must remain paused.
`lead:marketplace` records Creator Space Users, Opens, Version, and Updated
snapshots in `tools/lead-finder/marketplace-snapshots.local.csv`. Record a
baseline before uploads/posts, then record another snapshot after distribution
so Marketplace traction is visible even before email replies arrive.
`lead:marketplace-record` is the safer after-upload path: it records the
`marketplace_upload` action with the current `plugin.zip` SHA and can record
the after-upload Creator Space snapshot in the same command. It will refuse to
mark the upload done from the internal `.tmp/framer-marketplace-update.md`
brief alone; provide a Framer upload confirmation URL, screenshot path, admin
note, or all Creator Space snapshot values.

When a Gmail request includes a public site URL, add it to CRM and generate the
reply kit:

```bash
pnpm lead:intake -- --site-url https://example.framer.website --contact-email founder@example.com --note "gmail mini audit request"
pnpm lead:audit -- --domain example.framer.website
```

For an agency request or `/agency/` form submission, generate the promised
client handoff note instead:

```bash
pnpm lead:handoff -- --url https://client-site.com --contact-email partner@example.com --agency "Example Studio" --context "pre-launch client handoff"
```

## 12. Agency partner discovery

Framer agencies and experts can be higher-value prospects than one-off site
owners because they can reuse the plugin across client launches.

Create a local URL list from search results or manual research:

```text
.tmp/framer-agency-candidates.txt
```

Then extract public emails, Framer agency/expert signals, and an outreach CSV:

```bash
pnpm lead:agency -- --input .tmp/framer-agency-candidates.txt --crm tools/lead-finder/outreach.local.csv
```

Agency outreach links to the `/agency/#template` handoff template by default,
so the CTA gives immediate client-launch QA value before asking for a client
URL in the request form.
The agency copy also pulls a short public positioning signal from the crawled
page, such as Official Framer Expert, Book a Call, or available-for-work, so
the opening line is specific enough to support reply testing.
The current Day 0 agency experiment is `agency-handoff-v2`: it leads with a
free 3-point client handoff note and treats the plugin as support infrastructure,
not the main ask.

Default outputs:

```text
.tmp/framer-agency-discovered.md
.tmp/framer-agency-discovered-outreach.csv
```

The optional `--crm` flag excludes domains already in the outreach CRM. The
fetcher also falls back to `curl` when Node fetch fails, which helps with
agency sites that intermittently reset TLS connections.
Use `--max-runtime-ms` for large directories or search dumps; when the runtime
guard trips, the tool still writes the partial evidence report and CSV instead
of hanging on the remaining queued URLs.
Shared profile platforms such as Framer Community, LinkedIn, Contra, Dribbble,
Instagram, X/Twitter, and Behance are kept in the evidence report but excluded
from the outreach CSV. Use them for manual research only; importing them directly
would pollute CRM dedupe with generic domains such as `framer.com`.

After reviewing the evidence, import and verify ready rows:

```bash
pnpm lead:crm -- --import .tmp/framer-agency-discovered-outreach.csv
pnpm lead:crm -- --domain example-agency.com --set-status verified --note "agency partner manual verify"
```

Generate the send queue with:

```bash
pnpm lead:sendpack -- --status verified --variant value-first
pnpm lead:gmail-queue -- --status verified --sendpack-dir .tmp/framer-send-pack
```

## 13. Reddit organic pilot

The Reddit pilot is an eight-week, founder-led organic program. It uses a
separate ignored activity ledger so genuine community contributions, rule
checks, product posts, qualitative insights, moderation events, and cumulative
24h/72h/7d snapshots are reviewable without mixing them into cold outreach.

Initialize the ledger and capture the currently verified subreddit rule
sources:

```bash
pnpm lead:reddit-activity -- --init --seed-rules
```

Record each real non-promotional contribution with its public URL. Do not count
short acknowledgements, reused copy, comments on your own post, product mentions,
or links toward the 9:1 gate.

```bash
pnpm lead:reddit-activity -- --add --event contribution --subreddit framer --url '<public-comment-url>' --topic '<problem answered>' --category aeo --note 'No product name or link.' --evidence '<public-comment-url>'
```

Run the plugin/community preflight before any product post:

```bash
pnpm lead:public-health
pnpm lead:reddit-preflight -- --plugin polyglot-aeo --subreddit nocode
```

The preflight enforces the configured calendar, allowed community, same-day
rules check, transparent profile evidence, nine qualifying contributions in 14
days, seven-day portfolio exclusivity, plugin sequence, moderation state,
public-health/payment blockers, same-day Marketplace baseline, required flair,
developer disclosure, one direct link, and copy safety. It never publishes.

After a manual post, record the public URL and cumulative snapshots, then run:

```bash
pnpm lead:reddit-review
```

The review uses the latest cumulative snapshot per post, checks missing due
windows, applies continue/scale/stop thresholds, and keeps Loka blocked until
both a Tier A experiment and its public-health/compliance gate are ready.

Tracked sources:

```text
tools/lead-finder/reddit-pilot-config.json
tools/lead-finder/reddit-activity.example.csv
docs/growth/reddit/REDDIT-PLAYBOOK.md
docs/growth/reddit/PROFILE-AND-OUTREACH.md
docs/growth/reddit/drafts/
```

Local/generated outputs:

```text
tools/lead-finder/reddit-activity.local.csv
.tmp/framer-reddit-activity.md
.tmp/framer-reddit-preflight.md
.tmp/framer-reddit-review.md
```
