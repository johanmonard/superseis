# Session State

<!--
  Cross-session orientation snapshot. Keep under 20 lines of YAML.
  Agents: read on startup, update on closeout. This is a snapshot, not a log.
-->

```yaml
active_work: (none — fresh template)
stage: not started
updated: (set on first session)

recent_decisions: []

open_constraints:
  - Auth flow is a local-development stub — replace before deploying
  - Database is SQLite — swap DATABASE_URL for production

next_action: >
  Run npm run setup, rename app in config/app.config.ts,
  create first module, replace auth stub when ready.
```
