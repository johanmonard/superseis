import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";

export type DataTableColumnAlign = "left" | "right";
export type DataTableCellTone = "default" | "muted" | "strong";

export interface DataTableColumn<TData> {
  id: string;
  header: React.ReactNode;
  cell: (row: TData) => React.ReactNode;
  align?: DataTableColumnAlign;
  tone?: DataTableCellTone;
}

export interface DataTableProps<TData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  title?: React.ReactNode;
  description?: React.ReactNode;
  search?: React.ReactNode;
  headerAction?: React.ReactNode;
  emptyMessage?: string;
  getRowId?: (row: TData, index: number) => string;
}

function toneClass(tone: DataTableCellTone = "default") {
  if (tone === "muted") {
    return "text-[var(--color-text-secondary)]";
  }

  if (tone === "strong") {
    return "font-medium";
  }

  return "";
}

export function DataTable<TData>({
  columns,
  data,
  title,
  description,
  search,
  headerAction,
  emptyMessage = "No rows available.",
  getRowId,
}: DataTableProps<TData>) {
  const hasHeader = Boolean(title || description || search || headerAction);
  const lastColumnIndex = columns.length - 1;

  return (
    <Card>
      {hasHeader ? (
        <CardHeader
          className={cn(
            "items-start gap-4",
            search ? "sm:flex-row sm:items-center sm:justify-between" : ""
          )}
        >
          {title || description ? (
            <div className="space-y-1">
              {title ? <CardTitle>{title}</CardTitle> : null}
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            {search ? <div className="w-full sm:w-auto">{search}</div> : null}
            {headerAction}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="app-scrollbar overflow-x-auto">
        <table className="app-table min-w-max">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    column.align === "right" ? "text-right" : "text-left",
                    index === lastColumnIndex ? "" : "pr-4"
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((row, index) => (
                <tr
                  key={getRowId ? getRowId(row, index) : String(index)}
                >
                  {columns.map((column, columnIndex) => (
                    <td
                      key={column.id}
                      className={cn(
                        column.align === "right" ? "text-right" : "text-left",
                        toneClass(column.tone),
                        columnIndex === lastColumnIndex ? "" : "pr-4"
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-6 text-center text-xs text-[var(--color-text-secondary)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
