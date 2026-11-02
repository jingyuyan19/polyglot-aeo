# Onboarding — setup wizard + launch checklist

Two surfaces, separate jobs:

| Surface | Location | Purpose |
|---------|----------|---------|
| **Setup wizard** | Centered modal overlay; auto-opens on first launch | **3 steps:** welcome → API key → back to dashboard |
| **Launch checklist** | Dashboard `QuickStart` | Schema, llms, deploy, verify, optional locales/meta |

Completion signals: [`src/lib/onboarding.ts`](../src/lib/onboarding.ts). The wizard only gates on `hasApiKey` for resume; it does not track schema/llms in the wizard flow.

## Wizard screens (v4 — 3 steps)

1. **welcome** — Warm greeting + what the plugin does + `WizardProjectSnapshot` (locale count, schema pill, AI pill). **Get started** / **Maybe later** (skip).
2. **aiSetup** — [`WizardAiSetupPanel`](../src/components/WizardAiSetupPanel.tsx): save + test; auto-advances to step 3 on success. AI is recommended but not blocking; primary CTA can continue without AI so manual schema + launch checks remain available.
3. **done** — Points to the launch checklist; **Open launch checklist** clears `OnboardingDismissed` so the checklist is visible.

Schema / llms / Meta / verify are **not** in the wizard — use Quick Start on the dashboard.

## Re-entry

- Top bar icon (left of Settings) → modal overlay; full 3-step review from welcome. Current tool view stays underneath (dimmed).
- Settings → Reset setup guide → wizard auto-opens on next plugin open.

## Storage keys

- `onboarding-wizard-completed`
- `onboarding-wizard-skipped-all`
- `onboarding-wizard-last-screen`
- `onboarding-dismissed` (checklist panel only; cleared on wizard finish)

## Manual steps

See [USER-FRICTION.md](./USER-FRICTION.md).
