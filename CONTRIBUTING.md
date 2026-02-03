# Contributing

Thanks for considering a contribution to HANAMI.

## Branch + commit conventions

- Branch from `main`. Naming: `feat/<short-slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
- Commits use conventional-commits prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `perf:`, `style:`, `ci:`, `deps:`.
- One logical change per commit. Squash WIP fixups before opening a PR.

## Local checks before opening a PR

```bash
cargo fmt --all
cargo check --workspace
anchor test --skip-build
```

The CI runs the same trio. PRs that break any of them will be rejected automatically.

## Pull request expectations

1. Reference any related issue with `Closes #123`.
2. Describe what changed and why.
3. If the change touches the on-chain program or the IDL, update `CHANGELOG.md`.
4. If the change adds or changes a public API on the SDK or CLI, update the relevant README and `docs/`.

## Tests

- Add an integration test in `tests/` for any new instruction or invariant.
- For SDK changes, add a unit test in `sdk/src/__tests__/`.
- For CLI changes, prefer property-based tests over snapshot tests.

## Code style

- Rust: enforced by `rustfmt.toml`. Run `cargo fmt --all` before commit.
- TypeScript: enforced by `prettier`. Run `yarn lint:fix`.
- Markdown: 2-space indentation, no trailing whitespace, one heading per section.

## Disclosure

Security-impacting issues go through `security@hanami.network`, not GitHub Issues.
See [SECURITY.md](SECURITY.md).
