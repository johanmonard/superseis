"use client";

import * as React from "react";

import {
  fetchClosureProgress,
  runPipelineStepClosure,
  type ClosureProgress,
} from "@/services/api/project-pipeline";

/** Page-level bottom drawer state for ocfa pipeline runs.
 *
 * Every workspace page can trigger a closure run via `startClosure`. The
 * drawer in app/(workspace)/layout.tsx subscribes to this context and
 * renders either a collapsed status strip or an expanded log panel.
 *
 * Polling is coarse (800 ms) — pipeline steps emit several progress
 * messages per second at most, and cheaper polling keeps the context
 * snappy even on slower machines.
 */

export type PipelineReportState =
  | { kind: "idle" }
  | {
      kind: "running";
      projectId: number;
      target: string;
      progress: ClosureProgress;
    }
  | {
      kind: "done";
      projectId: number;
      target: string;
      progress: ClosureProgress;
      finishedAt: number;
    };

export interface PipelineReportContextValue {
  state: PipelineReportState;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  startClosure: (projectId: number, step: string) => Promise<void>;
  dismiss: () => void;
}

const PipelineReportContext =
  React.createContext<PipelineReportContextValue | null>(null);

export function PipelineReportProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PipelineReportState>({ kind: "idle" });
  const [expanded, setExpanded] = React.useState(false);
  const pollRef = React.useRef<number | null>(null);
  const autoCollapseRef = React.useRef<number | null>(null);

  const clearPoll = React.useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);
  const clearAutoCollapse = React.useCallback(() => {
    if (autoCollapseRef.current !== null) {
      window.clearTimeout(autoCollapseRef.current);
      autoCollapseRef.current = null;
    }
  }, []);

  React.useEffect(() => () => {
    clearPoll();
    clearAutoCollapse();
  }, [clearPoll, clearAutoCollapse]);

  const dismiss = React.useCallback(() => {
    clearPoll();
    clearAutoCollapse();
    setState({ kind: "idle" });
    setExpanded(false);
  }, [clearPoll, clearAutoCollapse]);

  const startClosure = React.useCallback(
    async (projectId: number, step: string) => {
      clearPoll();
      clearAutoCollapse();
      setExpanded(true);

      let initial: ClosureProgress;
      try {
        initial = await runPipelineStepClosure(projectId, step);
      } catch (err) {
        setState({
          kind: "done",
          projectId,
          target: step,
          finishedAt: Date.now(),
          progress: {
            target: step,
            steps: [],
            current_index: 0,
            done: true,
            error: err instanceof Error ? err.message : "Failed to start run",
            running: false,
          },
        });
        return;
      }

      setState({ kind: "running", projectId, target: step, progress: initial });
      if (initial.done) {
        setState({
          kind: "done",
          projectId,
          target: step,
          progress: initial,
          finishedAt: Date.now(),
        });
        return;
      }

      pollRef.current = window.setInterval(async () => {
        try {
          const next = await fetchClosureProgress(projectId, step);
          if (next.done) {
            clearPoll();
            setState({
              kind: "done",
              projectId,
              target: step,
              progress: next,
              finishedAt: Date.now(),
            });
          } else {
            setState({
              kind: "running",
              projectId,
              target: step,
              progress: next,
            });
          }
        } catch {
          // Transient network failures are ignored — the next poll will
          // catch up. If the backend truly dies, the user can dismiss.
        }
      }, 800);
    },
    [clearPoll, clearAutoCollapse],
  );

  // Auto-collapse the drawer 3 s after successful completion. Errors keep
  // it expanded so the user sees the failure reason.
  React.useEffect(() => {
    clearAutoCollapse();
    if (state.kind !== "done") return;
    if (state.progress.error) return;
    autoCollapseRef.current = window.setTimeout(() => {
      setExpanded(false);
    }, 3000);
  }, [state, clearAutoCollapse]);

  const value = React.useMemo<PipelineReportContextValue>(
    () => ({ state, expanded, setExpanded, startClosure, dismiss }),
    [state, expanded, startClosure, dismiss],
  );

  return (
    <PipelineReportContext.Provider value={value}>
      {children}
    </PipelineReportContext.Provider>
  );
}

export function usePipelineReport(): PipelineReportContextValue {
  const ctx = React.useContext(PipelineReportContext);
  if (!ctx) {
    throw new Error("usePipelineReport must be used inside PipelineReportProvider");
  }
  return ctx;
}
