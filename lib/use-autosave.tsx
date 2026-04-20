"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  sectionKeys,
  useProjectSection,
} from "@/services/query/project-sections";
import {
  saveProjectSection,
  type ProjectSectionData,
} from "@/services/api/project-sections";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 2000;

/**
 * Section-data hook — React Query cache is the single source of truth.
 *
 * `data`   – always reflects the latest state (server → cache → optimistic).
 * `update` – writes to the cache immediately and debounce-saves to the server.
 * On unmount / page-hide the pending save is flushed with `keepalive`.
 *
 * No local hydration dance, no readyToTrack, no race conditions.
 */
export function useSectionData<T extends object>(
  projectId: number | null,
  section: string,
  defaultData: T,
) {
  const { data: serverData, isLoading } = useProjectSection(projectId, section);
  const queryClient = useQueryClient();

  const [status, setStatus] = React.useState<SaveStatus>("idle");

  // Refs for use in callbacks that must not re-create on every render
  const mountedRef = React.useRef(true);
  const pendingRef = React.useRef<Record<string, unknown> | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const projectIdRef = React.useRef(projectId);
  const sectionRef = React.useRef(section);
  const defaultRef = React.useRef(defaultData);

  projectIdRef.current = projectId;
  sectionRef.current = section;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Clear pending save when project changes
  React.useEffect(() => {
    pendingRef.current = null;
    clearTimeout(timerRef.current);
    setStatus("idle");
  }, [projectId]);

  // --------------- derived data ---------------

  const data: T = React.useMemo(() => {
    if (!serverData?.data || Object.keys(serverData.data).length === 0) {
      return defaultRef.current;
    }
    return serverData.data as T;
  }, [serverData]);

  // --------------- flush (save to server) ---------------

  const flush = React.useCallback(
    async (options?: { keepalive?: boolean }) => {
      const pid = projectIdRef.current;
      const sec = sectionRef.current;
      const toSave = pendingRef.current;
      if (!pid || !toSave) return;

      pendingRef.current = null;
      clearTimeout(timerRef.current);

      if (mountedRef.current) setStatus("saving");

      try {
        const saved = await saveProjectSection(pid, sec, toSave, {
          keepalive: options?.keepalive,
        });
        queryClient.setQueryData<ProjectSectionData>(
          sectionKeys.detail(pid, sec),
          saved,
        );
        if (mountedRef.current) setStatus("saved");
      } catch {
        if (mountedRef.current) setStatus("error");
      }
    },
    [queryClient],
  );

  // --------------- update (optimistic cache + debounce) ---------------

  const update = React.useCallback(
    (newData: T) => {
      const pid = projectIdRef.current;
      const sec = sectionRef.current;
      if (!pid) return;

      // Optimistic cache write — consumers re-render immediately
      queryClient.setQueryData<ProjectSectionData>(
        sectionKeys.detail(pid, sec),
        (old) => ({
          section: sec,
          data: newData as Record<string, unknown>,
          updated_at: old?.updated_at ?? null,
        }),
      );

      // Schedule debounced save
      pendingRef.current = newData as Record<string, unknown>;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [queryClient, flush],
  );

  // --------------- safety-net saves ---------------

  // Flush on unmount
  React.useEffect(() => {
    return () => {
      void flush({ keepalive: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush on browser unload
  React.useEffect(() => {
    const handle = () => void flush({ keepalive: true });
    window.addEventListener("pagehide", handle);
    window.addEventListener("beforeunload", handle);
    return () => {
      window.removeEventListener("pagehide", handle);
      window.removeEventListener("beforeunload", handle);
    };
  }, [flush]);

  // Reset "saved" indicator after 2 s
  React.useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(t);
  }, [status]);

  return { data, update, flush, isLoading, status };
}

/**
 * Tiny status indicator — same as before.
 */
export function AutosaveStatus({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : "Save failed";
  const color =
    status === "error"
      ? "var(--color-status-danger)"
      : "var(--color-text-muted)";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {label}
    </span>
  );
}
