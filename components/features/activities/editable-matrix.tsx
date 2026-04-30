"use client";

import * as React from "react";

import {
  UnitValueControl,
  WORK_TIME_UNITS,
} from "@/components/features/resources/resource-parameters";
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
    <div className={cn("app-scrollbar overflow-x-auto", className)}>
      <table
        className={cn(
          "app-table",
          "!table-fixed w-full",
          "[&_thead_th]:!bg-transparent",
          "[&_tbody_tr]:!bg-transparent",
          "[&_tbody_tr:hover]:!bg-transparent",
          "[&_thead_th]:overflow-hidden",
          "[&_tbody_td]:overflow-hidden",
        )}
      >
        <thead>
          <tr>
            <th />
            {labels.map((col) => (
              <th key={col} className="truncate text-center" title={col}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((row) => (
            <tr key={row}>
              <th
                scope="row"
                className="font-normal text-[var(--color-text-primary)]"
              >
                {row}
              </th>
              {labels.map((col) => {
                const raw = value[row]?.[col] ?? "";
                const filled = raw.trim().length > 0 && raw.trim() !== "0";
                return (
                  <td
                    key={col}
                    className={cn(
                      "text-center",
                      filled &&
                        "[&_input]:!bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
                    )}
                  >
                    <UnitValueControl
                      value={raw}
                      units={WORK_TIME_UNITS}
                      defaultUnit="s"
                      ariaLabel={`Slip time from ${row} to ${col}`}
                      onChange={(v) => handleChange(row, col, v)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
