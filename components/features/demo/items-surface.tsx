// -----------------------------------------------------------------------
// REFERENCE ONLY — do not copy this file as a starting point.
// Use `npm run new-module <name>` to scaffold new features instead.
//
// This page demonstrates the full-stack integration pattern:
// Page → Query Hook → API Service → Backend Route → Database
//
// It performs real CRUD against the backend. Start both frontend and backend
// to see it work, then study the pattern before building your own.
// -----------------------------------------------------------------------

"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useItemsList, useCreateItem, useDeleteItem } from "@/services/query/items";

export function ItemsSurface() {
  const [name, setName] = useState("");
  const { toast } = useToast();
  const { data: items, isLoading, error } = useItemsList();
  const createMutation = useCreateItem();
  const deleteMutation = useDeleteItem();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setName("");
          toast(`"${trimmed}" added`, "success");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <div className="space-y-[var(--space-4)]">
      <Card>
        <CardHeader className="flex-col items-start gap-[var(--space-1)]">
          <CardTitle>Full-Stack Integration Pattern</CardTitle>
          <CardDescription>
            This page performs real CRUD against the backend database. It
            demonstrates the complete flow: page → query hook → API service →
            FastAPI route → SQLAlchemy model → SQLite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-[var(--space-2)]">
          <Badge variant="info">useQuery</Badge>
          <Badge variant="info">useMutation</Badge>
          <Badge variant="outline">GET /items</Badge>
          <Badge variant="outline">POST /items</Badge>
          <Badge variant="outline">DELETE /items/:id</Badge>
          <Badge variant="success">useToast</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="items-start sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Items</CardTitle>
            <CardDescription>
              Sample model from{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1 py-0.5 text-xs font-mono">
                api/db/models.py
              </code>
              . Add items here and they persist in the database.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-[var(--space-3)]">
          {/* Create form */}
          <div className="flex gap-[var(--space-2)]">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="New item name"
              disabled={createMutation.isPending}
            />
            <Button
              variant="secondary"
              size="md"
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>

          {createMutation.error ? (
            <p className="text-xs text-[var(--color-status-danger)]">
              Failed to create item. Is the backend running?
            </p>
          ) : null}

          {/* List */}
          {isLoading ? (
            <div className="space-y-[var(--space-2)]">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height="2.5rem" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]">
              <p className="text-sm font-medium text-[var(--color-status-danger)]">
                Could not load items
              </p>
              <p className="mt-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
                Make sure the backend is running at the URL configured in{" "}
                <code className="rounded bg-[var(--color-bg-elevated)] px-1 py-0.5 font-mono">
                  NEXT_PUBLIC_API_BASE_URL
                </code>
                .
              </p>
            </div>
          ) : items && items.length > 0 ? (
            <div className="space-y-[var(--space-1)]">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {item.name}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      deleteMutation.mutate(item.id, {
                        onSuccess: () => toast(`"${item.name}" removed`),
                      })
                    }
                    disabled={deleteMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-[var(--space-3)] text-center text-sm text-[var(--color-text-muted)]">
              No items yet. Add one above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Architecture reference */}
      <Card>
        <CardHeader className="flex-col items-start gap-[var(--space-1)]">
          <CardTitle>How This Works</CardTitle>
          <CardDescription>
            The files involved in this full-stack flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-[var(--space-2)] text-sm text-[var(--color-text-secondary)]">
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                services/query/items.ts
              </code>{" "}
              — TanStack Query hooks with automatic cache invalidation on
              mutations.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                services/api/items.ts
              </code>{" "}
              — Typed API functions using the base{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                requestJson
              </code>{" "}
              client.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                api/routes/items.py
              </code>{" "}
              — FastAPI CRUD route using{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                get_db()
              </code>{" "}
              async dependency injection.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                api/db/models.py
              </code>{" "}
              — SQLAlchemy model defining the{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                items
              </code>{" "}
              table.
            </p>
            <p>
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                api/db/engine.py
              </code>{" "}
              — Async engine and session factory reading{" "}
              <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-xs font-mono">
                DATABASE_URL
              </code>{" "}
              from env.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
