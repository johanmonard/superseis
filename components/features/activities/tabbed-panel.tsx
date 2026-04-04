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
  children,
  className,
}: {
  items: T[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  children: (item: T) => React.ReactNode;
  className?: string;
}) {
  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;

  return (
    <div className={cn("space-y-[var(--space-2)]", className)}>
      <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)]">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "group flex items-center gap-1 px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium transition-colors",
              active?.id === item.id
                ? "border-b-2 border-[var(--color-accent)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            <span>{item.label}</span>
            {items.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="ml-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[var(--color-status-danger)]"
              >
                <span className="text-[10px]">&times;</span>
              </button>
            )}
          </button>
        ))}
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
