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

type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Autosave hook for project sections.
 *
 * Saves on component unmount and browser unload. Updates the React Query
 * cache immediately so remounting shows fresh data. Ignores data until
 * hydration is complete to avoid overwriting saved data with defaults.
 */
export function useAutosave(
  projectId: number | null,
  section: string,
  data: Record<string, unknown>,
) {
  const { data: saved, isLoading } = useProjectSection(projectId, section);
  const queryClient = useQueryClient();

  const [status, setStatus] = React.useState<AutosaveStatus>("idle");

  const dataRef = React.useRef(data);
  const projectIdRef = React.useRef(projectId);
  const sectionRef = React.useRef(section);
  const mountedRef = React.useRef(false);
  const lastPersistedJson = React.useRef("");
  const inFlightJson = React.useRef<string | null>(null);
  const readyToTrack = React.useRef(false);

  // Keep refs fresh
  dataRef.current = data;
  projectIdRef.current = projectId;
  sectionRef.current = section;

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // --- Determine initial server data for hydration ---
  // This is derived directly from the query result, not a separate state.
  // It's stable once loaded and doesn't re-trigger on cache updates.
  const initialDataRef = React.useRef<Record<string, unknown> | null>(null);
  const [initialData, setInitialData] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    if (initialDataRef.current !== null) return; // already captured
    if (isLoading) return; // still loading
    if (saved === undefined) return;

    if (saved.data && Object.keys(saved.data).length > 0) {
      initialDataRef.current = saved.data;
      setInitialData(saved.data);
      lastPersistedJson.current = JSON.stringify(saved.data);
    } else {
      initialDataRef.current = {};
      setInitialData({});
      // No saved data — current defaults are the baseline
      lastPersistedJson.current = JSON.stringify(dataRef.current);
    }
  }, [saved, isLoading]);

  // Reset on project change
  React.useEffect(() => {
    initialDataRef.current = null;
    setInitialData(null);
    lastPersistedJson.current = "";
    inFlightJson.current = null;
    readyToTrack.current = false;
    setStatus("idle");
  }, [projectId]);

  const setStatusSafely = React.useCallback((nextStatus: AutosaveStatus) => {
    if (!mountedRef.current) return;
    setStatus(nextStatus);
  }, []);

  // Called by component after it hydrates from initialData
  const markHydrationApplied = React.useCallback(() => {
    // Wait for the component's state update to flush, then snapshot
    // the hydrated state as the baseline for dirty-checking.
    requestAnimationFrame(() => {
      lastPersistedJson.current = JSON.stringify(dataRef.current);
      readyToTrack.current = true;
    });
  }, []);

  // If server had no data, mark ready immediately (component keeps defaults)
  React.useEffect(() => {
    if (
      initialData !== null &&
      Object.keys(initialData).length === 0 &&
      !readyToTrack.current
    ) {
      readyToTrack.current = true;
    }
  }, [initialData]);

  // --- Save logic ---
  const saveIfDirty = React.useCallback(async (options?: { keepalive?: boolean }) => {
    const pid = projectIdRef.current;
    if (!pid || !readyToTrack.current) return;

    const json = JSON.stringify(dataRef.current);
    if (json === lastPersistedJson.current || json === inFlightJson.current) return;

    const currentData = dataRef.current;
    const sec = sectionRef.current;
    inFlightJson.current = json;
    setStatusSafely("saving");

    try {
      const savedSection = await saveProjectSection(pid, sec, currentData, {
        keepalive: options?.keepalive,
      });

      lastPersistedJson.current = json;
      queryClient.setQueryData<ProjectSectionData>(
        sectionKeys.detail(pid, sec),
        savedSection,
      );
      setStatusSafely("saved");
    } catch {
      setStatusSafely("error");
    } finally {
      if (inFlightJson.current === json) {
        inFlightJson.current = null;
      }
    }
  }, [queryClient, setStatusSafely]);

  // Save on unmount
  React.useEffect(() => {
    return () => {
      void saveIfDirty({ keepalive: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on browser unload
  React.useEffect(() => {
    const handle = () => {
      void saveIfDirty({ keepalive: true });
    };
    window.addEventListener("pagehide", handle);
    window.addEventListener("beforeunload", handle);
    return () => {
      window.removeEventListener("pagehide", handle);
      window.removeEventListener("beforeunload", handle);
    };
  }, [saveIfDirty]);

  // Reset "saved" after 2s
  React.useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(t);
  }, [status]);

  return { initialData, status, markHydrationApplied };
}

/**
 * Tiny status indicator component.
 */
export function AutosaveStatus({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed";
  const color =
    status === "error" ? "var(--color-status-danger)" : "var(--color-text-muted)";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {label}
    </span>
  );
}
