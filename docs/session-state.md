# Session State

<!--
  Cross-session orientation snapshot. Keep under 20 lines of YAML.
  Agents: read on startup, update on closeout. This is a snapshot, not a log.
-->

```yaml
active_work: landing auth flow fixes verified; project list now waits for session before fetching
stage: sign-in and project-list loading fixes complete; broader worktree still mixed
updated: 2026-04-22

recent_decisions:
  - Landing login now syncs autofilled DOM credentials immediately on reveal/focus so one-click sign-in works
  - Added a frontend regression test covering autofilled credentials on the landing login hover card
  - The first sign-in click now re-reads live input DOM values so browser-restored credentials work without clicking the username first
  - Project list queries now stay disabled until auth session resolution/login completes, preventing stale empty state after sign-in

open_constraints:
  - Wider landing/auth rewrite is still in progress in the worktree (`home-overview`, auth route deletions, layout updates)
  - Wider project-section persistence work is still in progress in the worktree
  - Auth flow is a local-development stub — replace before deploying
  - Database is SQLite — swap DATABASE_URL for production

next_action: >
  Decide whether to isolate and commit the remaining landing/auth rewrite or split
  it into smaller commits; unrelated full frontend tests still fail in
  `tests/lib/use-autosave.test.tsx`.
```
