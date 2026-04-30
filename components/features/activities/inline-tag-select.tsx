"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function InlineTagSelect({
  options,
  value,
  onChange,
  placeholder = "Add...",
  className,
}: {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const available = options.filter((o) => !value.includes(o));

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-0.5 text-xs text-[var(--color-text-secondary)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <Icon icon={appIcons.x} size={10} />
          </button>
        </span>
      ))}
      {/* Always render the selector — even when there's nothing to add —
          so consumers (e.g. the Regions row in activity strips/sequences)
          show a visible "in front of the field" affordance regardless of
          whether the upstream pool is empty. When `available` is empty
          the dropdown disables itself and shows a contextual placeholder
          ("None available") so the user understands why nothing's
          there. */}
      <select
        value=""
        disabled={available.length === 0}
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        className="h-6 appearance-none border-none bg-transparent px-1 text-xs text-[var(--color-text-muted)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">
          {available.length === 0 ? "None available" : placeholder}
        </option>
        {available.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
