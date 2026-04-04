# System Decisions

## 2026-02-15 - System Stabilization Baseline Lock

- Canonical primitives in `components/ui/*` are the locked visual baseline.
- Layout max content width is tokenized and reserved for intentionally bounded surfaces only.
- Workspace shell defaults to mobile sidebar collapse readiness (`showSidebarOnMobile = false`).
- Focus ring offsets are standardized to `ring-offset-2` for interactive controls.
- Elevation stays restrained to low shadows across baseline surfaces.

## 2026-02-15 - Public Auth Surface Rule

- Authentication routes live under `app/(auth)/*` and must not import the workspace layout.
- Auth layout uses a centered neutral surface with restrained width for form readability.
- Auth pages compose canonical primitives only and avoid owning visual styling logic.

## 2026-02-15 - Primitive Authority Rule

- `components/ui/*` own visual styling authority; pages compose primitives and orchestrate behavior only.
- Styling extensions happen through canonical primitives first.
- Business logic stays outside primitive components.

## 2026-02-15 - Navigation Configuration System

- Sidebar navigation is defined via configuration, not layout implementation.
- Layout renders navigation dynamically.
- Modules are added through navigation config only.

## 2026-02-15 - Canonical Icon System

- `lucide-react` is the single icon source for the project.
- All icon rendering goes through `components/ui/icon.tsx`.
- Icon usage stays functional and restrained.

## 2026-03-11 - Consolidated Design Token System

- Two-layer token architecture: primitives in `styles/tokens.css`, semantics in `styles/globals.css`.
- Density is controlled through `data-density` with compact as the default.
- Dark mode remaps semantics through `data-theme="dark"`.
- Components reference semantic tokens only.

## 2026-03-19 - Workspace Pages Use The Full Main-Pane Width

- The workspace shell renders route content with `w-full max-w-none`.
- `workspace-container` remains reserved for intentionally bounded reading surfaces such as auth flows.

## 2026-03-19 - Workspace Main Pane Scrollbars Belong To Inner Regions

- The outer workspace main pane keeps `overflow-auto` but does not reserve a stable scrollbar gutter.
- Stable scrollbar behavior belongs on inner scroll regions through the shared `app-scrollbar` utility.

## 2026-03-19 - Badge Primitive Supports Semantic Status Tags

- The shared badge primitive owns semantic status variants for informational, success, and danger states.
- Feature components consume badge variants instead of inventing local colored-pill styling.

## 2026-03-31 - Sidebar Child Navigation May Carry Icons

- Child navigation items may define optional icons through navigation config.
- The shared workspace navigation renderer owns child-icon display in both expanded and collapsed sidebar modes.

## 2026-03-31 - Sidebar Active Navigation Uses Stronger Route Highlight

- Active sidebar rows use a restrained accent-tinted surface plus a visible border.
- Active navigation icons may shift to the semantic accent while inactive child icons stay muted.
- Hover remains calmer than active.

## 2026-03-31 - Expanded Sidebar Submenus Use Indented Child Blocks

- Expanded sidebar child navigation rows render as indented blocks.
- Nested hierarchy is communicated through spacing and token-based surfaces, not extra decoration.

## 2026-03-31 - Starter Session Stub Drives Admin Visibility

- The template uses a cookie-backed session stub exposed through `/auth/login`, `/auth/session`, and `/auth/logout`.
- Workspace navigation and admin-page access derive from the authenticated principal instead of a hardcoded UI flag.
- Usernames listed in `APP_ADMIN_USERS` are treated as admin identities by default.

## 2026-03-31 - Node-Based Module Generator Updates Starter Configs

- `npm run new-module <name>` is implemented as a Node script so scaffolding works cross-platform.
- The generator inserts baseline entries into navigation, release, and page-identity config files using in-file markers.
- New modules default to the shared `dashboards` icon until the app chooses a more specific one.

## 2026-03-31 - Template Ships A Bundled Operations Reference Module

- The starter includes a generic `Operations` module to demonstrate Stage 2 and Stage 3 composition patterns.
- The reference surfaces use only canonical primitives and local sample data.
- This bundled module is intended as a disposable reference, not as product logic to preserve indefinitely.

## 2026-04-01 - Starter Branding Lives In Shared App Config

- Starter identity values are defined in `config/app.config.ts`.
- The workspace sidebar, auth surface, and document metadata consume the shared config instead of local component defaults.
- Renaming the starter should be a config edit, not a component edit.

## 2026-04-01 - Template Lint Enforces Composition Guardrails

- The starter lint config rejects raw Tailwind color utilities in route, layout, and feature code.
- Direct `lucide-react` imports are reserved for `components/ui/icon.tsx`.
- Inline styles stay out of pages, layouts, and feature components; runtime sizing exceptions belong in canonical primitives only.

## 2026-04-01 - Workspace Header Owns Theme And Density Controls

- Global appearance controls live in the shared workspace header, not in feature pages.
- Theme mode and density both write through the persisted theme-preferences contract in `lib/theme.ts`.
- Density changes are workspace-wide and rely on token-driven `data-density` remapping rather than component-local variants.
