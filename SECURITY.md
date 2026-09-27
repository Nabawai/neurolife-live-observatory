# Security

This repository MUST remain private.

Never commit:

- NLB tickets
- passwords
- session cookies
- GitHub tokens
- Railway tokens
- API keys
- signing/HMAC material
- production mission payloads
- patient data
- unredacted clinical screenshots

Use GitHub Actions Secrets for `NL_CONNECT_URL` and `PUBLIC_DISCOVERY_TOKEN`.

The Observatory is read-only against NeuroLife. It must not call mutation, Arm, Commit, Apply, delete, payment, patient-write, or privileged administrative actions.

Production updates remain governed by NeuroLife Pull Bridge, Prove, Owner Policy, Apply, Fresh Verify and REG907.


## GitHub OIDC

V24.1 removes the need to store a permanent `NL_CONNECT_URL`.

The NeuroLife exchange endpoint must:
- verify GitHub OIDC signatures from `token.actions.githubusercontent.com`,
- require audience `neurolife-observatory`,
- allowlist the exact private Observatory repository/ref,
- reject replayed JWT `jti`,
- issue a read-only NLB for no more than 900 seconds,
- never return Apply/Arm/Commit/write permissions,
- never log the issued NLB value.
