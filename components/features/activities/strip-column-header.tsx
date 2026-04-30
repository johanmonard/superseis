"use client";

import * as React from "react";

/**
 * Inline editable header used by the column-per-area strip/sequence tables
 * on the Activity and Resource parameter pages. Double-click to rename;
 * × on hover removes the column.
 */
export function StripColumnHeader({
  label,
  canRemove,
  onRename,
  onRemove,
}: {
  label: string;
  canRemove: boolean;
  onRename: (next: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);

  const startEdit = () => {
    setDraft(label);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== label) onRename(next);
    setEditing(false);
  };

  return (
    <div
      className="group flex items-center gap-1 border-b-2 border-[var(--color-accent)] px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-primary)]"
      onDoubleClick={startEdit}
    >
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-full rounded-[var(--radius-sm)] bg-transparent px-1 text-xs outline-none ring-1 ring-[var(--color-accent)]"
        />
      ) : (
        <span className="flex-1 cursor-text truncate" title={label}>
          {label}
        </span>
      )}
      {canRemove && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-status-danger)]"
          aria-label="Remove area"
        >
          <span className="text-[10px]">&times;</span>
        </button>
      )}
    </div>
  );
}
