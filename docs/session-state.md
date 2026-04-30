# Session State

<!--
  Cross-session orientation snapshot. Keep under 20 lines of YAML.
  Agents: read on startup, update on closeout. This is a snapshot, not a log.
-->

```yaml
active_work: crew resources Maps table units added; broader worktree still mixed
stage: resource Maps table now uses compact value/unit controls
updated: 2026-04-28

recent_decisions:
  - Resource Maps table rows are the unique union of Travel Map, Moving Map, and allocated resource layers
  - Work time cells use time units s/mn/h/d; moving/travel speed cells use kmph/kts
  - Camps Definition labels were shortened to Map, POI vs Region, and POI Start
  - Work time is editable only for layers allocated to the active resource in crew_motion
  - Move speed and Travel speed are editable only when the selected Moving/Travel map contains that layer
  - Landing login now syncs autofilled DOM credentials immediately on reveal/focus so one-click sign-in works

open_constraints:
  - Worktree has pre-existing uncommitted changes, including resource-parameters.tsx
  - Changes for this task were not committed to avoid staging unrelated same-file work
  - Auth flow is a local-development stub — replace before deploying

next_action: >
  Review the mixed worktree, then commit this resources Maps slice separately
  or split the older resource-form changes first.
```
