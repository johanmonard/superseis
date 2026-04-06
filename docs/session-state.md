# Session State

<!--
  Cross-session orientation snapshot. Keep under 20 lines of YAML.
  Agents: read on startup, update on closeout. This is a snapshot, not a log.
-->

```yaml
active_work: harden project-section autosave reliability
stage: project-section persistence in progress
updated: 2026-04-06

recent_decisions:
  - Leave-page autosave now keeps a server-confirmed baseline and retries after failures
  - Project-section save requests use fetch keepalive during unload/pagehide

open_constraints:
  - Wider project-section persistence work is still in progress in the worktree
  - Auth flow is a local-development stub — replace before deploying
  - Database is SQLite — swap DATABASE_URL for production

next_action: >
  Verify autosave behavior manually across project subpages, then
  finish staging the broader persistence feature when it is ready.
```
