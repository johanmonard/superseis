"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function TabbedPanel<T extends { id: string; label: string }>({
  items,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  children,
  className,
}: {
  items: T[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename?: (id: string, label: string) => void;
  children: (item: T) => React.ReactNode;
  className?: string;
}) {
  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const startEdit = (item: T) => {
    if (!onRename) return;
    setEditingId(item.id);
    setDraft(item.label);
  };

  const commit = () => {
    if (editingId == null) return;
    const next = draft.trim();
    const current = items.find((i) => i.id === editingId);
    if (next && current && next !== current.label) {
      onRename?.(editingId, next);
    }
    setEditingId(null);
  };

  const cancel = () => setEditingId(null);

  return (
    <div className={cn("space-y-[var(--space-2)]", className)}>
      <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)]">
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const isActive = active?.id === item.id;
          return (
            <div
              key={item.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => {
                if (!isEditing) onSelect(item.id);
              }}
              onDoubleClick={() => startEdit(item)}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.id);
                } else if (e.key === "F2") {
                  e.preventDefault();
                  startEdit(item);
                }
              }}
              className={cn(
                "group flex cursor-pointer items-center gap-1 px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium transition-colors select-none",
                isActive
                  ? "border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancel();
                    }
                  }}
                  className="w-24 bg-transparent text-xs font-medium text-[var(--color-text-primary)] outline-none ring-1 ring-[var(--color-accent)] rounded-[var(--radius-sm)] px-1"
                />
              ) : (
                <span>{item.label}</span>
              )}
              {items.length > 1 && !isEditing && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="ml-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-status-danger)]"
                  aria-label="Remove tab"
                >
                  <span className="text-[10px]">&times;</span>
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add tab"
        >
          <Icon icon={appIcons.plus} size={12} />
        </button>
      </div>
      {active && <div>{children(active)}</div>}
    </div>
  );
}
