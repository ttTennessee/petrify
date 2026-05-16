# Security Policy

## Supported Versions

Petrify is in active pre-1.0 development. Only the latest commit on `master` receives security fixes. Once a tagged release line exists, this section will list the supported versions.

| Version | Supported          |
| ------- | ------------------ |
| `master` (HEAD) | ✅ |
| Older commits   | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

If you believe you have found a security vulnerability in Petrify, report it privately so the issue can be triaged and fixed before public disclosure.

Preferred channels (in order):

1. **GitHub Security Advisories** — open a [private advisory](../../security/advisories/new) on this repository. This is the preferred channel.
2. **Email** — `devilimp0@gmail.com` with the subject line `[petrify-security] <short description>`.

When reporting, please include as much of the following as you can:

- A description of the issue and its impact.
- Steps to reproduce, or a proof-of-concept.
- The affected commit / version.
- Any suggested mitigation, if you have one.

## What to Expect

- **Acknowledgement** within 5 business days.
- **Initial assessment** within 10 business days, including whether the report is accepted, needs more information, or is out of scope.
- **Fix timeline** depends on severity; critical issues will be prioritized. You will be kept informed of progress.
- **Coordinated disclosure** — once a fix is available, we will publish an advisory crediting the reporter (unless anonymity is requested).

## Scope

In-scope:

- The Petrify runtime (`packages/server`), web IDE (`packages/web`), and shared schemas (`packages/shared`).
- Bundled adapters (`mock`, `acp`) in this repository.
- Sample blueprints in `examples/` only insofar as they could trigger runtime vulnerabilities.

Out of scope:

- Third-party Agent executors invoked via an adapter (report to the relevant project).
- Issues that require an already-compromised host or operator-level access.
- Denial-of-service achievable only by crafting an obviously malicious workflow and running it against your own instance — Petrify is self-hosted; the operator is the trust boundary.

## Hardening Notes (Operator-Side)

Petrify is self-hosted. A few invariants operators should preserve:

- **Secrets** resolved from the `Env` scope must never be persisted into Prompt Snapshots or the Artifact Store. The runtime enforces this — do not patch around it.
- **Untrusted blueprints** should be reviewed before import. Verification catches structural problems (deadlocks, unbounded loops) but does not sandbox what an adapter does at runtime.
- **Network exposure** — do not expose the Petrify HTTP/WebSocket port to the public internet without an authenticating reverse proxy. There is no built-in authentication in the MVP.
