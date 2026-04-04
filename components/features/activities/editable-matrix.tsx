"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function EditableMatrix({
  labels,
  value,
  onChange,
  className,
}: {
  labels: string[];
  value: Record<string, Record<string, string>>;
  onChange: (value: Record<string, Record<string, string>>) => void;
  className?: string;
}) {
  const handleChange = (row: string, col: string, val: string) => {
    const next = { ...value };
    if (!next[row]) next[row] = {};
    next[row] = { ...next[row], [col]: val };
    onChange(next);
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pb-1 pr-1 text-left font-medium text-[var(--color-text-muted)]" />
            {labels.map((col) => (
              <th
                key={col}
                className="pb-1 px-1 text-center font-medium text-[var(--color-text-muted)]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((row) => (
            <tr key={row}>
              <td className="py-1 pr-1 text-[var(--color-text-secondary)]">{row}</td>
              {labels.map((col) => (
                <td key={col} className="py-1 px-1">
                  {row === col ? (
                    <div className="flex h-[var(--control-height-md)] items-center justify-center text-[var(--color-text-muted)]">
                      &mdash;
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={value[row]?.[col] ?? ""}
                      onChange={(e) => handleChange(row, col, e.target.value)}
                      className="h-[var(--control-height-md)] w-full min-w-[3rem] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-1 text-center text-xs text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
