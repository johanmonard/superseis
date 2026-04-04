"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function CheckboxMatrix({
  rows,
  columns,
  value,
  onChange,
  className,
}: {
  rows: string[];
  columns: string[];
  value: Record<string, string | null>;
  onChange: (value: Record<string, string | null>) => void;
  className?: string;
}) {
  const handleToggle = (row: string, col: string) => {
    const next = { ...value };
    next[row] = value[row] === col ? null : col;
    onChange(next);
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pb-1 pr-2 text-left font-medium text-[var(--color-text-muted)]">
              Layer
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="pb-1 px-2 text-center font-medium text-[var(--color-text-muted)]"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="py-1 pr-2 text-[var(--color-text-secondary)]">{row}</td>
              {columns.map((col) => (
                <td key={col} className="py-1 px-2 text-center">
                  <Checkbox
                    checked={value[row] === col}
                    onCheckedChange={() => handleToggle(row, col)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
