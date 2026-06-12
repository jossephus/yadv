# Local diff viewer

Strip GitHub out of ghui and turn it into a local working-tree diff viewer. Launching
`ghui` should immediately show the diff of the current repo's changes (≈ `git diff`),
rendered in the existing TUI diff view, with the file picker, themes, command palette,
and overall "feel" preserved.

## Why

- The diff viewer + TUI feel (file picker, themes, keyboard-driven navigation) is the
  part worth keeping for local use.
- Everything else in ghui is GitHub plumbing (PR/issue lists, comments, merge, labels,
  repo workspace, `gh` CLI, caching, mock data) that we don't want for a local tool.
- Goal: minimal local tool now; add features later on a clean base.

## What we'd ship (v1)

- Run `ghui` in any git repo → it opens straight into the diff view for the working
  tree (staged + unstaged tracked changes vs `HEAD`, i.e. `git diff HEAD`), no
  list/menu in between.
- Reuse the current diff rendering: split/unified toggle, wrap toggle, whitespace
  toggle, syntax highlighting, sticky file headers, scroll/jump keys.
- Keep the **file picker** (changed-files modal, `f`) to jump between changed files.
- Keep **themes** (theme modal, system-theme follow) and the **command palette**.
- Keep footer hints, loading/spinner polish, scroll/selection ergonomics.
- `r` reloads the diff from disk. `q` / `ctrl-c` quits.
- No GitHub: no PRs, issues, comments, merge, labels, repo switching, `gh`, caching,
  mock data, telemetry tied to GitHub.

## Architecture mapping

### The reuse seam

The diff stack only needs **patch text + filetype**. Today `GitHubService.getPullRequestDiff(repo, #)`
returns a patch string that flows through `pullRequestDiffAtom` → `diff.ts` parser →
`PullRequestDiffPane`'s `<diff>` element. We swap the *source* of that patch string and
keep the renderer.

```
git diff  ──▶  GitService.workingTreeDiff()  ──▶  diff.ts parser  ──▶  DiffPane (<diff>)
                       (new)                          (keep)             (keep, decoupled)
```

### New code

- `src/services/GitService.ts` — Effect service built on the existing `CommandRunner`
  (reused, just runs `git` instead of `gh`):
  - `repoRoot(): Effect<string, ...>` — `git rev-parse --show-toplevel`.
  - `workingTreeDiff(): Effect<string, ...>` — `git diff HEAD` (staged + unstaged
    tracked changes). Untracked files are out of scope for v1.
  - `currentBranch(): Effect<string, ...>` — for the header (`git rev-parse --abbrev-ref HEAD`).
- `src/diffTarget.ts` (or inline) — a small `LocalDiffTarget` model
  `{ repoName: string; branch: string; additions: number; deletions: number }`
  to replace `PullRequestItem` in the diff pane header.
- New atom(s) in a trimmed `src/ui/diff/atoms.ts`:
  - `workingTreeDiffAtom` (replaces `pullRequestDiffAtom`) → `GitService.workingTreeDiff`.
  - keep UI-state atoms: `diffRenderViewAtom`, `diffWrapModeAtom`,
    `diffWhitespaceModeAtom`, `diffScrollTopAtom`, `diffFileIndexAtom`.
  - drop comment atoms (`diffCommentThreadsAtom`, anchors, ranges, etc.).
- New runtime layer in `src/services/runtime.ts`: provide `GitService` (+ `Clipboard`,
  `Observability`) over `CommandRunner`; remove GitHub/cache/mock layers and all
  `GHUI_MOCK_*` branching.

### Keep (reusable, light edits)

- `src/index.tsx` — renderer bootstrap, syntax-parser registration, system-theme reload.
- Themes: `src/ui/colors.ts`, `src/themeStore.ts`, `src/themeConfig.ts`,
  `src/systemThemeReload.ts`, `src/systemAppearance.ts`, `src/ui/modals/ThemeModal.tsx`,
  `src/ui/theme/*`, `src/keymap/themeModal.ts` + `contexts/themeModalCtx.ts`.
- Diff core: `src/ui/diff.ts`, `src/ui/diff/useDiffLineColors.ts`,
  `src/ui/diff/useDiffLocationPreservation.ts`, `src/ui/diffStats.tsx`
  (strip comment-anchor helpers from `diff.ts`).
- Diff pane: `src/ui/PullRequestDiffPane.tsx` → rename to `src/ui/DiffPane.tsx`,
  decouple from `PullRequestItem`/comments (header takes `LocalDiffTarget`; remove
  `selectedCommentAnchor`, `selectedCommentThread`, comment peek, mouse-to-comment).
- File picker: `src/ui/modals/ChangedFilesModal.tsx` + `src/keymap/changedFilesModal.ts`
  + `contexts/changedFilesModalCtx.ts` + its `shared.tsx` search helpers.
- Command palette: `src/ui/CommandPalette.tsx`, `src/commands.ts`, `src/commands/*`,
  `src/keymap/commandPalette.ts` + ctx (prune GitHub commands from the registry).
- Keymap infra: `@ghui/keymap`, `src/keyboard/opentuiAdapter.ts`, `src/keymap/helpers.ts`,
  `src/keymap/diffView.ts` (prune comment/review/merge actions), `src/keymap/all.ts`
  (collapse to: diff view + command palette + theme modal + changed-files modal).
- UI primitives: `src/ui/primitives.tsx`, `src/ui/modals.tsx` (ModalFrame),
  `src/ui/FooterHints.tsx`, `src/ui/spinner.ts`, `src/ui/useSpinnerFrame.ts`,
  `src/ui/LoadingLogo.tsx`, scroll/selection utils
  (`useScrollFollowSelected`, `useScrollPersistence`, `useClampedIndex`,
  `useTerminalFocus`, `usePasteHandler`, `useTextInputDispatcher`, `singleLineInput`).
- Services infra: `src/services/runtime.ts` (rewired), `src/services/CommandRunner.ts`
  (drop the GitHub rate-limit classification import), `src/services/Clipboard.ts`,
  `src/services/systemAtoms.ts`, `src/observability.ts`, `src/config.ts` (trim to
  `commandTimeoutMs`).
- Misc: `src/errors.ts`, `src/date.ts`.

### Strip (GitHub-specific)

- Services: `GitHubService.ts`, `githubSchemas.ts`, `githubNormalize.ts`,
  `githubRateLimit.ts`, `mockData.ts`, `mockFixtures.ts`, `MockGitHubService.ts`,
  `CacheService.ts`.
- Lists/loading: `src/ui/PullRequestList.tsx`, `IssueList.tsx`, `RepoList.tsx`,
  `pullRequests.ts`, `pullRequestLoad.ts`, `pullRequestCache.ts`, `pullRequestViews.ts`,
  `issueLoad.ts`, `issueViews.ts`, `item.ts`, `gitRemotes.ts`,
  `src/ui/pullRequests/*`, `src/ui/issues/*`.
- Comments / merge / labels: `src/ui/comments*`, `src/ui/comments/*`, `src/ui/merge/*`,
  `LabelChips.tsx`, modals `LabelModal`, `MergeModal`, `SubmitReviewModal`,
  `CommentModal`, `CommentThreadModal`, `DeleteCommentModal`, `CloseModal`,
  `PullRequestStateModal`, `OpenRepositoryModal`, `FilterModal`, plus their keymaps,
  contexts, and atoms.
- Workspace shell: `src/surfaces/*`, `src/workspace/*`, `src/workspaceSurfaces.ts`,
  `src/workspacePreferences*.ts`, `src/ui/WorkspaceTabs.tsx`, `src/ui/ActiveFilterBar.tsx`,
  `src/ui/DetailsPane.tsx`, `src/ui/CommentsPane.tsx`, `src/ui/SubjectMetaLine.tsx`,
  `src/viewSync.ts`.
- Domain: `src/domain.ts`, `src/mergeActions.ts` (keep only the few diff types the pane
  needs, moved into `diff.ts` or a small `diffTarget.ts`).
- `BrowserOpener.ts` — likely drop (was for opening PRs); revisit if we want "open file
  in editor" later.

### App.tsx

`App.tsx` (2801 LOC) shrinks dramatically. New shell:

1. On mount, run `workingTreeDiffAtom`; show `LoadingLogoPane` while pending.
2. On ready, render `DiffPane` full-screen with `LocalDiffTarget` header + `FooterHints`.
3. Wire keymap scopes: diff view (always active) + command palette + theme modal +
   changed-files modal. Drop all surface/list/detail/comment state.
4. Empty state: "No changes" when the diff is empty.

## Suggested order (keep it compiling)

1. Add `GitService` + `workingTreeDiffAtom`; verify it returns a real patch string.
2. Decouple `DiffPane` from `PullRequestItem`/comments (introduce `LocalDiffTarget`,
   remove comment props).
3. Rewrite `App.tsx` shell + `runtime.ts` layer to launch into the local diff.
4. Trim `keymap/all.ts`, `commands/*`, `diff/atoms.ts`, `diffView.ts` to the kept set.
5. Delete the GitHub modules listed above; fix imports until typecheck is clean.
6. Cleanup: `package.json` (name/description/keywords/bin, drop unused deps like
   `@effect/sql-sqlite-bun`), `config.ts`, `README.md`, `.env.example`, AGENTS.md
   release/GitHub notes, tests under `test/` (drop GitHub fixtures, keep diff-parser
   tests).
7. Run `bun run format:check`, `typecheck`, `lint`, `test`.

## Open questions

- **CLI args / path scope?** v1 = whole repo, no args. Later: `ghui <path>`, `ghui --staged`,
  `ghui <rev>..<rev>`.
- **Not a git repo / no changes** → friendly empty/error pane (already have `StatusCard`).
- **Auto-refresh on file change?** Out of scope for v1; manual `r` reload only.
- **Keep telemetry/Observability?** Harmless to keep; can strip later.
- **Package identity** — rename the npm package / bin, or keep `ghui`? Affects release
  workflow + Homebrew tap automation (see AGENTS.md). Probably out of scope for local use.

## Out of scope (v1)

- Untracked files, per-path/rev CLI args, staged-only view.
- Editing, staging/unstaging, committing from the TUI.
- Comments, reviews, anything writing back anywhere.
- Auto-refresh / file watching.
- Publishing/release pipeline changes.

## Status

Not started.
