# NeuroLife GitHub Live Observatory

Private GitHub-native observability and visual QA for NeuroLife.

## Purpose

This repository is the **eyes** of the NeuroLife AI/developer workflow. It does not replace the production updater and it does not deploy production code.

Production remains:

`Private Production GitOps → NeuroLife Pull Bridge → Prove → Owner Policy → Apply → Fresh Verify → REG907 → STABLE`

The Observatory runs on **GitHub Actions**, not Railway.

## What it captures

- Real Chromium rendering with Playwright
- Android small/medium, tablet and desktop viewports
- Redacted screenshots
- DOM/interactivity snapshot
- Browser console errors
- page errors
- failed requests
- HTTP 4xx/5xx responses
- horizontal overflow/mobile geometry
- visual comparison against a stored baseline
- machine-readable Control Plane truth
- sanitized public `LIVE_STATUS.json`

## Repositories

Recommended separation:

1. **Production GitOps (PRIVATE)**  
   Existing NeuroLife production repository. Keep it private.

2. **Live Observatory (PRIVATE)**  
   This repository. Screenshots, reports and GitHub Actions artifacts stay private.

3. **AI Discovery (PUBLIC)**  
   `Nabawai/Neurolife-ai-updat-2`  
   Documentation plus optional sanitized `LIVE_STATUS.json`.

## Required GitHub Secret

Create this repository as **Private** and add:

### `NL_CONNECT_URL`
The current complete owner-authorized unified NeuroLife URL:

`https://neurolife.cloud/connect.php/<CURRENT-NLB-TICKET>`

Never commit it to a file.

The workflow strips query strings from logs and redacts NLB ticket patterns from collected textual evidence.

## Optional GitHub Secret

### `PUBLIC_DISCOVERY_TOKEN`

A fine-grained GitHub token with **Contents: Read and write** only for:

`Nabawai/Neurolife-ai-updat-2`

When configured, the private workflow publishes only:

`LIVE_STATUS.json`

No NLB ticket, screenshot, DOM, console body, credential, patient data or private mission is intentionally published.

## Run

GitHub → Actions → **NeuroLife Live Observatory** → Run workflow.

It also runs every 30 minutes.

## Establish a baseline

After visually accepting the current live interface:

GitHub → Actions → **NeuroLife Visual Baseline** → Run workflow.

The workflow commits the current redacted screenshots into `baselines/`. Future audits compare against them.

## Evidence

Each run uploads a private artifact:

`neurolife-live-observatory-<run-id>`

It contains:

- `report.json`
- `summary.md`
- `public-live-status.json`
- `screenshots/`
- `dom/`
- `control/`
- `diffs/`

## Privacy

The default capture applies visual redaction selectors before screenshots and redacts secrets/phones/emails from textual evidence.

For authenticated clinical pages, use **synthetic test accounts only** unless a separately approved privacy workflow is added. Do not store patient credentials or reusable production sessions in this repository.

## Next expansion

The scaffold is ready for role-specific synthetic sessions:

- OWNER
- DOCTOR
- SECRETARY
- ACCOUNTANT
- PATIENT

Add their routes to `config/routes.json` after establishing a safe synthetic session mechanism. Keep real patient data out of visual regression fixtures.


## V24.1 — Expiring NLB links solved with GitHub OIDC

Do **not** store `NL_CONNECT_URL` as a permanent GitHub Secret.

The NLB link is intentionally short-lived. The correct permanent authentication path is:

`GitHub Actions OIDC → NeuroLife OIDC Exchange → short-lived OBSERVATORY_READ_ONLY NLB → audit → expiry`

The workflow now requests a GitHub OIDC identity token on every run and exchanges it for a fresh NeuroLife read-only session. Nothing needs to be manually refreshed.

### GitHub configuration

No permanent NLB secret is required.

Optional repository variable:

`NL_OBSERVATORY_EXCHANGE_URL`

Default:

`https://neurolife.cloud/api/observatory_oidc_exchange.php`

### Required NeuroLife server capability

NeuroLife must expose the OIDC exchange endpoint and enforce `contracts/OBSERVATORY_OIDC_EXCHANGE_1.json`.

The endpoint must verify the GitHub token signature and claims before issuing a session. It must issue only `OBSERVATORY_READ_ONLY`, maximum TTL 15 minutes, and must reject Apply/Arm/Commit/mutation capabilities.

This removes the permanent-secret problem and lets scheduled GitHub audits run indefinitely without owner intervention.
