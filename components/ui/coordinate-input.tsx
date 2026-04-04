"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

export interface CoordinateInputProps {
  x: string;
  y: string;
  onXChange: (v: string) => void;
  onYChange: (v: string) => void;
  align?: "left" | "right";
  className?: string;
  disabled?: boolean;
}

/**
 * Single input displaying coordinates as "(x, y)".
 * Clicking opens inline editing; blur or Enter commits.
 */
export function CoordinateInput({
  x,
  y,
  onXChange,
  onYChange,
  align = "right",
  className,
  disabled,
}: CoordinateInputProps) {
  const [editing, setEditing] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const display = `(${x}, ${y})`;

  const startEdit = () => {
    if (disabled) return;
    setRaw(`${x}, ${y}`);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commit = () => {
    const parts = raw.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      onXChange(parts[0] || "0");
      onYChange(parts[1] || "0");
    } else if (parts.length === 1) {
      onXChange(parts[0] || "0");
      onYChange("0");
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className={cn(
          "h-[var(--control-height-md)] w-full rounded-[var(--radius-sm)] border border-[var(--color-focus-ring)] bg-[var(--color-bg-surface)] px-[var(--space-3)] text-sm text-[var(--color-text-primary)] outline-none",
          align === "right" ? "text-right" : "text-left",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      className={cn(
        "flex h-[var(--control-height-md)] w-full items-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] text-sm text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:border-[var(--color-border-strong)]",
        align === "right" ? "justify-end" : "justify-start",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {display}
    </button>
  );
}
