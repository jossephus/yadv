# Repository Notes

## Release Process

- Release workflow: `.github/workflows/publish.yml`.
- Add a changeset for every user-facing change with `bun run changeset`.
- Check pending changesets with `bun run changeset:status`.
- Apply pending changesets with `bun run changeset:version`; this bumps `package.json` and updates `CHANGELOG.md` when release notes exist.
- Run `bun run format:check`, `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run package:smoke` before committing the version bump.
- Commit and push the version bump and consumed changesets to `main`.
- Create a release named and tagged `v<package.json version>`.
- The workflow verifies the release tag matches `package.json`, builds standalone binaries, and uploads release assets.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.
- Create changeset: `bun run changeset`.
- Check changesets: `bun run changeset:status`.
- Apply changesets: `bun run changeset:version`.
- Create release: `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes "..."`.
- Check publish run: `gh run list --workflow publish.yml --limit 5`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- Before release commits, also run `bun run package:smoke`.
- Before release commits, also run `bun run build:standalone`.
- If formatting fails, run `bunx oxfmt src/ test/ dev/` or format only the touched files, then rerun `bun run format:check`.
- CI enforces formatting with `bun run format:check`; do not rely on manual review to catch formatting drift.

## UI Conventions

- Modal dividers must connect to the side borders with junction characters (`├` / `┤`). When adding a horizontal divider inside a modal body, thread the divider's row index through `ModalFrame`'s `junctionRows` so the side bars render `├`/`┤` at that row instead of `│`. Inline `<Divider>`s without a corresponding junction row look detached and are wrong.

## Plans

Larger features and redesigns are captured in markdown under `plans/` before work starts. Each plan has Why / What / API mapping / Open questions / Status. When taking on something non-trivial, check `plans/` first; when sketching a future-direction idea, write a plan there rather than only mentioning it in chat or commits. See `plans/README.md` for the format and index.

## Future Work

- Consider click-drag support in diffs to select a comment range.
- See `plans/` for tracked feature plans (e.g. CLI path/rev args for the local diff viewer).
