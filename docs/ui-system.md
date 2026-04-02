# UI System

This document defines the visual system used by all UI primitives.
Pages and feature components must consume these rules through `components/ui/*`.

## Token Architecture

The system uses a two-layer token approach:

1. Primitives (`styles/tokens.css`) - raw color scales, typography values, density-dependent spacing
2. Semantics (`styles/globals.css`) - purpose-driven tokens that map to primitives

Components reference semantic tokens such as `--color-accent` and `--color-bg-surface`.
Pages should never reference raw hex values or primitive palette tokens directly.

## Primitive Palette

Defined in `styles/tokens.css`:

- Slate scale: `--slate-50` through `--slate-900`
- Accent scale: `--teal-400`, `--teal-700`
- Brand red: `--red-500`

Add new raw values in `tokens.css` first, then map them semantically in `globals.css`.

## Semantic Tokens

Use semantic tokens only:

- Backgrounds: `--color-bg-canvas`, `--color-bg-surface`, `--color-bg-elevated`
- Borders: `--color-border-subtle`, `--color-border-strong`
- Text: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- Accent: `--color-accent`, `--color-accent-foreground`, `--color-focus-ring`
- Status: `--color-status-info`, `--color-status-success`, `--color-status-warning`, `--color-status-danger`

Dark mode is activated via `data-theme="dark"` on `<html>` or any container element.

## Typography

Defined in `styles/tokens.css`:

- `--font-size-xxs` through `--font-size-2xl`
- `--font-weight-regular`, `--font-weight-medium`, `--font-weight-semibold`, `--font-weight-bold`

Use the existing scale instead of arbitrary font sizes.

## Density

Density is activated via `data-density` on `<html>` or any container.
Compact is the default.

- Comfortable
- Compact
- Dense

Density changes spacing and sizing, not component identity.

Default composition rhythm should prefer `--space-2`, `--space-3`, `--space-4`, and `--space-6`.

## Layout Rules

- The workspace shell spans the full available main-pane width.
- `workspace-container` is reserved for intentionally bounded layouts such as auth surfaces.
- Stable scrollbar gutters belong on inner scroll regions through `.app-scrollbar`, not on the outer workspace shell.

## Primitive Expectations

- Buttons, inputs, badges, dialogs, cards, and navigation styling belong to `components/ui/*`.
- Pages and feature components compose primitives; they do not restyle them locally.
- Icons render through `components/ui/icon.tsx` only.
