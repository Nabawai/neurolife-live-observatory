# Architecture

## Control flow

```text
Public AI Discovery
       |
       v
Owner supplies current NLB link
       |
       v
Private GitHub Observatory
       |
       +--> Playwright real browser
       |      +--> screenshots
       |      +--> DOM geometry
       |      +--> console/page errors
       |      +--> network failures
       |      +--> visual diff
       |
       +--> Control Plane read-only truth
       |      +--> developer_handoff
       |      +--> native_current_truth
       |      +--> runtime_truth
       |      +--> reg907_guard
       |      +--> updater_status
       |      +--> full_health
       |      +--> pull_bridge_status
       |
       +--> private GitHub Actions artifact
       |
       `--> sanitized LIVE_STATUS.json --> Public AI Discovery
```

## Explicit non-goal

GitHub Actions Observatory is not a production executor.

It does not replace or bypass:

`Private GitOps → Pull Bridge → Prove → Owner Policy → Apply → Fresh Verify → REG907`.

## AI consumption model

An authorized AI can inspect:

1. Public discovery docs.
2. Sanitized public `LIVE_STATUS.json`.
3. Private Observatory workflow runs/artifacts when GitHub permission is granted.
4. The current owner-supplied NLB control plane for current truth.

This gives the AI visual and runtime evidence without exposing production secrets publicly.


## Authentication — V24.1

```text
GitHub Actions
    |
    | OIDC identity token (short lived)
    v
NeuroLife OIDC Exchange
    |
    | verifies repo/ref/audience/signature + anti-replay
    v
Ephemeral OBSERVATORY_READ_ONLY NLB (<=15 min)
    |
    v
Live audit
    |
    v
automatic expiry
```

There is no permanent NLB URL stored in GitHub.
