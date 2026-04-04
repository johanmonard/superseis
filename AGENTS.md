# Workspace App Template - Agent Rules

This repo is a living UI design system, not a page generator.
The agent acts as a UI architect maintaining visual coherence through code.

---

## Golden Rules (Non-Negotiable)

1. System before screens - If a pattern is missing, extend the system first, then build the feature.
2. Components are permanent, pages are disposable - All UI composes from canonical primitives. No duplicate styling.
3. No visual decisions in pages - Pages compose and connect data. Colors, spacing, typography belong to primitives.
4. Modern SaaS default - Soft radius, subtle borders, low shadows, neutral + single accent, balanced whitespace.
5. Consistency over creativity - Reuse, extend, refine. Never invent when a pattern exists.

---

## Architecture Map

```text
components/ui/*          -> UI primitives (own all styling authority)
components/features/*    -> Domain UI built from primitives
components/layout/*      -> Workspace shell (PROTECTED - see below)
app/(workspace)/*/       -> Pages (thin orchestration, zero styling)
app/(auth)/*             -> Auth routes (separate layout, centered neutral surface)
config/navigation.config -> Single source of truth for sidebar nav
config/app.config.ts     -> App identity / starter branding
config/release.config    -> Module gating per release profile
config/workspace-page    -> Route -> title/subtitle mapping
styles/tokens.css        -> Primitive tokens (colors, type, density)
styles/globals.css       -> Semantic tokens, resets, layout utilities
```

---

## Token Contract

- Two layers: primitives (raw values) -> semantics (purpose-driven).
- Pages and features use semantic tokens only - never raw color classes.
- Spacing follows the density-aware scale (`--space-1` through `--space-6`).
- Default density: compact. Three tiers: comfortable / compact / dense.
- Icons: `lucide-react` only, rendered through `components/ui/icon.tsx`.

When doing token or primitive work, read `docs/ui-system.md` first.

---

## Layout Authority (Protected Boundary)

`components/layout/workspace-layout.tsx` is system infrastructure.

- Never modify for feature additions.
- Navigation changes go in `config/navigation.config.ts` - never hardcode in layout.
- Layout may only change for structural workspace evolution or system-wide upgrades.

If a request asks to modify layout for a feature, refuse and propose a config change instead.

---

## Handling Vague or Risky Requests

When a request is ambiguous, subjective, or could break system consistency, do not guess. Clarify first, then propose options within the system.

**Triggers — pause and ask before acting:**
- Visual changes without a clear target ("make it look better", "change the style")
- Color or spacing requests that don't map to an existing token or variant
- Requests that would affect a single element but should be a system-wide change
- "Just make it work" requests that skip architecture (e.g. inline styles, hardcoded data)

**How to respond:**
1. Acknowledge the goal — restate what the user wants in concrete terms.
2. Propose 2-3 options that stay within the system — e.g. "I can (A) switch to the `danger` variant, (B) add a new `warning` variant to the Button primitive, or (C) use a Badge instead."
3. Explain the trade-off briefly — which option is local vs. reusable, which affects other pages.
4. Let the user choose before writing code.

**Examples:**

| User says | Agent responds |
|-----------|---------------|
| "Make the button red" | "The Button has `primary`, `secondary`, and `ghost` variants. I can (A) add a `danger` variant to the Button primitive so it's reusable, or (B) use a `danger` Badge next to the existing button. Which fits your intent?" |
| "Make this more compact" | "The workspace uses the compact density tier by default. I can (A) switch specific elements to `size='sm'`, (B) reduce card padding via a new Card variant, or (C) switch the whole app to the dense tier. What scope do you have in mind?" |
| "Change the font" | "Typography is controlled by the token system in `tokens.css`. Changing it would affect the entire app. Is that what you want, or do you need a specific heading to stand out?" |
| "Just add a quick table here" | "Tables are a Stage 3 pattern. This page is currently Stage 1. I can (A) add the table using the DataTable primitive, which upgrades this page to Stage 3, or (B) use cards to show the same data in a Stage 1 layout. Which approach?" |

If the user insists on a change that breaks a rule, explain which rule it breaks and why. If they still want it, comply but flag it with a code comment: `// NOTE: breaks system convention — see AGENTS.md`.

---

## Forbidden Patterns

- Raw Tailwind color classes in pages or feature components
- Inline styles in pages, layouts, or feature components
- Locally redefining button/card/input/badge/dialog styles
- Arbitrary px spacing outside the defined scale
- Mixing layout paradigms within one view
- Direct lucide imports in pages (use icon primitive)
- Decorative or excessive icon usage
- Copying reference module files as feature starting points

---

## Feature Stages

New modules start at Stage 1 unless explicitly told otherwise.

| Stage | Allowed | Forbidden |
|-------|---------|-----------|
| 1 - Structure | Header, cards, grouped info, nav integration | Tables, filters, forms, charts, pagination |
| 2 - Interaction | Actions, dialogs, form inputs, lightweight state | Complex data grids |
| 3 - Data | Tables, filters, sorting, search | Only with explicit request |
| 4 - Advanced | Dashboards, complex workflows | Only with explicit instruction |

If higher complexity is requested too early, warn and recommend a staged approach.

---

## Forms

The canonical form stack is the `Field` primitive + inline validation logic. No external form library is required for simple forms (1-3 fields). For anything larger, use this stack:

**Blessed stack:** `react-hook-form` + `zod`

Install when the first non-trivial form is needed:
```bash
npm install react-hook-form zod @hookform/resolvers
```

**Pattern:**

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof schema>;

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Field label="Name" error={errors.name?.message}>
        <Input {...register("name")} />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input {...register("email")} />
      </Field>
    </form>
  );
}
```

**Rules:**
- Define schemas with `zod`. Colocate them with the form component or in a shared `lib/schemas/` file if reused.
- Use the `Field` primitive's `error` prop for inline validation messages — never render errors outside `Field`.
- Keep `zod` schemas as the single source of truth for validation. Do not duplicate checks in submit handlers.
- For simple forms (login, single-field dialogs), local state + manual checks are acceptable. Do not over-engineer.
- Server-side errors (API failures) use the error handling patterns below, not form validation.

---

## Error & Loading States

The template provides `ErrorBoundary`, `ApiError`, query retry policy, and skeleton/empty patterns. Use the right tool for the right failure mode:

| Situation | Pattern | How |
|-----------|---------|-----|
| **Query loading** | Skeleton or spinner inside the feature component | Check `isLoading` from the query hook. Show a placeholder that matches the final layout shape. |
| **Query error** (recoverable) | Inline error card with retry button | Check `isError` + `error` from the query hook. Render a `Card` with the error message and a retry `Button` that calls `refetch()`. |
| **Empty state** | Inline empty message | Check `data.length === 0` after loading succeeds. Show a calm message inside the content area — not a modal or toast. |
| **Mutation error** (form submit, delete) | Inline error text near the action | Catch the error from `mutateAsync`, display via local state near the button or in the `Field` error prop. The login surface is the reference pattern. |
| **Unexpected crash** | `ErrorBoundary` | Already wraps the workspace. No per-feature setup needed unless a feature should recover independently. |
| **Background failure** (non-blocking) | Toast notification | Use when the user's primary flow is not interrupted — e.g., a background refresh fails while the stale data is still visible. |

**Rules:**
- Default to inline errors. Use toasts only for non-blocking, secondary failures.
- Never swallow errors silently. If a mutation fails, the user must see feedback.
- The query client already retries transient errors (5xx, 408, 429) up to 2 times. Do not add custom retry logic on top.
- Permanent client errors (4xx except 408/429) are not retried. Show the error immediately.
- Loading skeletons should approximate the shape of the loaded content (matching card count, table row height). Avoid generic spinners when the layout is known.

---

## New Module Checklist

Use `npm run new-module <name>` to scaffold. This generates:
- Frontend: page, feature component, API service, query hook, config entries.
- Backend: route file with model + CRUD stubs, app.py router registration.
- A post-scaffold TypeScript check runs automatically.

Pass `--frontend-only` to skip backend generation.

Then:

1. Review the generated nav, release, and page-identity entries.
2. Build the initial overview (Stage 1: header + cards).
3. Adjust the default navigation icon if `dashboards` is not appropriate.
4. Customise the model columns in the generated `api/routes/<name>.py`.
5. Generate a migration: `npm run db:migrate "add <table> table"`
6. Apply it: `npm run db:upgrade`
7. Review spacing and alignment against the nearest existing page.
8. Commit.

### Removing a Module

Use `npm run remove-module <name>` to reverse a scaffold.

This removes the generated files and cleans up config entries in navigation, release, workspace-page, and app.py. Only files and blocks it can positively identify as generated are removed.

Review the diff before committing.

---

## Design Memory

Reusable conventions must be recorded in `docs/design-memory/system-decisions.md`.

Triggers - record when a task introduces:
- A reusable UI pattern or layout rule
- Navigation or interaction philosophy changes
- Density/spacing/accessibility conventions

Format - each entry: Decision Name, Problem Solved, Rule Introduced, Implementation Locations, Locked Invariants.

Append-only - never rewrite history. Not required for feature-specific UI or routing additions.

---

## Database

- ORM: SQLAlchemy async with `aiosqlite` (SQLite default).
- Connection: `api/db/engine.py` reads `DATABASE_URL` from env. Swap to Postgres by changing the connection string.
- Models: define in `api/db/models.py` or new files importing `Base`. The bundled `Item` model is a disposable sample.
- Migrations: Alembic (`api/alembic/`), wrapped with convenience scripts:
  - `npm run db:migrate "description"` — generate a migration from model changes.
  - `npm run db:upgrade` — apply pending migrations.
  - `npm run db:downgrade` — roll back the last migration.
  - `npm run db:status` — show the current migration revision.
- Tables are auto-created on FastAPI startup via lifespan hook. Use Alembic for production schema evolution.
- Inject `get_db` as a FastAPI dependency to get an `AsyncSession`.

### Adding a model for a new module

`npm run new-module <name>` generates both frontend and backend files, including a route file with model and CRUD stubs. After scaffolding:

1. Customise the model columns in `api/routes/<name>.py` (or move the model to `api/db/models.py` once it stabilises).
2. Generate a migration: `npm run db:migrate "add <table> table"`
3. Apply it: `npm run db:upgrade`
4. Update the frontend types and query hooks to match your model.

For modules that only need a frontend, use `npm run new-module <name> --frontend-only` and add backend models/routes manually later.

---

## Testing

- Backend: `pytest` + `pytest-asyncio`. Tests in `api/tests/`. Conftest provides an in-memory SQLite test database and async HTTP client.
- Frontend: `vitest` + `@testing-library/react`. Tests in `tests/`. Config in `vitest.config.ts`.
- Run backend tests: `cd api && pytest`
- Run frontend tests: `npm test`
- Tests are run explicitly, not in the pre-commit hook.

---

## On-Demand References

Read these when relevant, not every session:

| Doc | Read when... |
|-----|--------------|
| `docs/ui-system.md` | Doing token work, adding/modifying primitives, density questions |
| `docs/design-memory/system-decisions.md` | Touching an area with prior decisions, or recording a new one |
| `docs/auth-replacement.md` | Replacing the auth stub with a real provider |
| `docs/deployment.md` | User asks to deploy, go to production, or prepare for hosting |
| `docs/environment-guide.md` | Managing env vars across local/staging/production tiers |

---

## Session Continuity

Use `docs/session-state.md` for cross-session orientation.

- Read on startup to understand active work and constraints.
- Update after each commit or meaningful boundary — not just at closeout.
  Sessions can end abruptly (user closes tab, token limit, crash).
  If the snapshot is only written at closeout, a fresh agent inherits stale context.
- On closeout, do a final update to capture what is next.

Keep it under 20 lines. It is a snapshot, not a log.

---

## New App Kickoff

When the user indicates they are starting a fresh app from this template, do not jump straight into feature work.

Examples:
- "Let's start developing a new app"
- "Bootstrap a new app from this starter"
- "Set up this template as a new product"

First guide the kickoff and verify these items:

1. Confirm dependencies are installed and the local frontend/backend can run.
2. Point the user to `.env.example` and `api/.env.example`, and call out missing env vars before API-connected work.
3. Rename starter placeholders early if they still exist (`package.json` name, visible app branding, starter copy).
   App identity belongs in `config/app.config.ts`, not component defaults.
4. Ask whether to keep or remove the bundled `Demo` and `Admin` reference surfaces.
   Use `npm run setup -- --trim-reference` to remove them, or `--keep-reference` to keep them.
5. Remind the user that the auth flow is a local-development stub and must be replaced before real deployment.
6. Once the repo is oriented, propose the first real module at Stage 1 unless a later stage is explicitly requested.

Default behavior:
- If the user starts feature work without having done the kickoff, pause briefly and walk through this checklist first.
- Use `README.md` for command-level setup.
- Use `docs/session-state.md` for the current handoff status of the starter.

---

## Auth Provider Replacement

The bundled auth is a development stub. Read `docs/auth-replacement.md` for the full replacement runbook. Key constraint: the replacement must preserve `AuthPrincipal`, the three dependency functions (`session_auth`, `session_admin_auth`, `api_key_or_session_auth`), and the cookie-based session flow.

---

## Deployment

When the user asks to deploy or prepare for production:

1. Run `npm run preflight` — it checks for auth stub, default secrets, SQLite, localhost CORS, and cookie config.
2. Read `docs/auth-replacement.md` if auth stub has not been replaced yet.
3. Read `docs/deployment.md` for Docker Compose and platform deploy paths.
4. Read `docs/environment-guide.md` for env var management across tiers.

---

## Commit Conventions

Format: `type(scope): message` - for example `feat(ui):`, `fix(workspace):`, `refactor(system):`, `chore(config):`

Pre-commit hook enforces lint + typecheck (`tsc --noEmit`). The full production build runs in CI only.
If the hook fails, fix the issue. Do not bypass it.

### Auto-Commit

The agent commits automatically at meaningful boundaries. Do not wait for the user to ask.

**When to commit:**
- After scaffolding a new module (`npm run new-module`)
- After completing a feature slice (component + page + wiring are done and working)
- After a system extension (new primitive, new token, config change)
- After a bug fix or stabilization pass
- After updating documentation (AGENTS.md, README.md, session-state.md)

**When NOT to commit:**
- Mid-implementation — all files for a logical change should go in one commit
- After only reading or exploring code
- When the pre-commit hook is failing — fix the issue first

**Commit sizing:**
- One logical change per commit. A feature that touches 5 files is one commit, not five.
- If a task has natural stages (scaffold → implement → wire up → document), each stage can be its own commit.
- When in doubt, smaller commits are better than larger ones.

**Behavior:**
- Stage only the files relevant to the change. Do not use `git add -A`.
- Never commit secrets, `.env*` files, `*.db`, or build artifacts.
- If the pre-commit hook fails, fix the issue and create a new commit — never amend, skip hooks, or force.
- After committing, briefly tell the user what was committed.

---

## Quality Checklist (Before Completing UI Work)

- [ ] Only canonical primitives used
- [ ] Semantic tokens respected (no raw colors)
- [ ] Spacing follows system scale
- [ ] Pages own orchestration only (no styling)
- [ ] Visually consistent with existing workspace pages
- [ ] Design memory updated if a new reusable pattern was introduced

---

## Scope Discipline

- Change only required files. No opportunistic refactors.
- Ask before major dependency additions or toolchain changes.
- Never commit secrets, tokens, `.env*`, or credentials.
- Never run destructive commands without approval.
- Prefer workspace-local installs.
- Keep starter snapshots source-only. Never ship `.next/`, `node_modules/`, `.pyc`, or local build caches.

---

## Product Context

Professional workspace starter for teams monitoring data and acting on domain workflows.

- Density target: information-dense internal tooling - compact, readable, grid-aligned.
- Interaction tone: direct, calm, minimal decoration, functional emphasis via semantic accent.
- UX philosophy: information first, predictable interaction model, system-led evolution.

---

## Third-Party Components

Before integrating external UI:

1. Verify package API and docs.
2. Wrap inside a canonical component.
3. Enforce semantic tokens.
4. Keep the integration reversible.
