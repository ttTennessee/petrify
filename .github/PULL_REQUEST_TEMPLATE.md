<!--
Thanks for contributing to Petrify! A few things before you open this PR:
- Read CLAUDE.md to make sure your change respects the architectural invariants.
- Locate your change on the milestone ladder (M1–M5). Avoid pulling post-MVP semantics into core paths.
- For runtime changes, add or update tests under packages/server/src/**/*.test.ts.
-->

## Summary

<!-- One or two sentences. What does this PR change and why? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Docs / examples
- [ ] CI / tooling
- [ ] Breaking change (workflow schema, adapter manifest, or runtime event format)

## Checklist

- [ ] `npm run typecheck` passes locally
- [ ] `npm --workspace @petrify/server run test` passes locally
- [ ] `npm run build` passes locally
- [ ] If runtime / schema / event format changed: docs in `docs/` updated
- [ ] If user-visible UI changed: tested manually in the dev server

## Related issues

<!-- Closes #123 -->
