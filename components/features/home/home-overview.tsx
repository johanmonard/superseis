"use client";

import * as React from "react";
import Image from "next/image";
import { appIcons } from "@/components/ui/icon";

const { chevronRight: ChevronRight, folderOpen: FolderOpen } = appIcons;

import { useActiveProject } from "@/lib/use-active-project";
import { useProjectList, useCreateProject } from "@/services/query/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProjectSettingsWorkflow } from "./project-settings-workflow";
import {
  AnimationLoop,
  SpinningCube,
  PendulumWave,
  FractalTree,
  WaveMesh,
} from "./landing-wireframes";

/* ------------------------------------------------------------------
   Hooks
   ------------------------------------------------------------------ */

const AMBIENT_SOUND_SRC = "/sound/ambient-drone.mp3";
const AMBIENT_FADE_MS = 10_000;

function useLandingAmbientSound(enabled: boolean) {
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const audio = new Audio(AMBIENT_SOUND_SRC);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = "auto";

    let raf = 0;
    let gestureAttached = false;
    let cycleStart = 0; // wall-clock ms when the current loop began
    let prevTime = 0;

    audio.addEventListener("play", () => {
      cycleStart = performance.now();
      prevTime = audio.currentTime;
    });

    const tick = () => {
      if (!audio.paused) {
        const d = audio.duration;
        const t = audio.currentTime;

        // Detect loop wrap: currentTime jumped backward.
        if (t + 0.1 < prevTime) {
          cycleStart = performance.now();
        }
        prevTime = t;

        const fadeSec = AMBIENT_FADE_MS / 1000;
        const elapsedSec = (performance.now() - cycleStart) / 1000;
        const fadeIn = Math.min(1, elapsedSec / fadeSec);
        const fadeOut =
          isFinite(d) && d > 0 && t > d - fadeSec
            ? Math.max(0, (d - t) / fadeSec)
            : 1;
        audio.volume = Math.min(1, Math.max(0, Math.min(fadeIn, fadeOut)));
      }
      raf = requestAnimationFrame(tick);
    };

    const removeGesture = () => {
      if (!gestureAttached) return;
      gestureAttached = false;
      window.removeEventListener("pointerdown", gestureHandler, true);
      window.removeEventListener("keydown", gestureHandler, true);
      window.removeEventListener("touchstart", gestureHandler, true);
    };

    const gestureHandler = () => {
      audio
        .play()
        .then(() => {
          setBlocked(false);
          removeGesture();
        })
        .catch(() => {});
    };

    const attachGesture = () => {
      if (gestureAttached) return;
      gestureAttached = true;
      window.addEventListener("pointerdown", gestureHandler, true);
      window.addEventListener("keydown", gestureHandler, true);
      window.addEventListener("touchstart", gestureHandler, true);
    };

    audio.addEventListener("error", () => {
      console.error("[ambient] audio load error", audio.error);
    });

    audio
      .play()
      .then(() => setBlocked(false))
      .catch((err) => {
        console.info("[ambient] autoplay blocked, waiting for gesture", err?.name ?? err);
        setBlocked(true);
        attachGesture();
      });

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      audio.pause();
      removeGesture();
    };
  }, [enabled]);

  return { blocked };
}

function useIsDarkTheme() {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute("data-theme-kind") === "dark");
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-kind"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */


const ABOUT_PARAGRAPHS = [
  "Seiseye is a web app for 3D seismic acquisition simulation, built for seismic contractors, oil companies, and field managers.",
  "Define your survey, resources, terrain, and strategy, then run the simulation, compare scenarios, optimize cost and timing, and export the analytics and visuals that support your decisions — all within a single, fully integrated platform.",
  "Built on over 40 years of field and hands-on experience, it handles the most complex operations in a fraction of the time required by traditional methods.",
  "What you get: reliable forecasts, defensible decisions, and full control over every project, end-to-end.",
];

const ABOUT_PARAGRAPH_INTERVAL_MS = 5000;
const ABOUT_SLOT_H = 140;
const ABOUT_ENTRY_OFFSET = 16;

function AboutHoverCard({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  const [phase, setPhase] = React.useState(0);
  const [entered, setEntered] = React.useState<Set<number>>(new Set());
  const N = ABOUT_PARAGRAPHS.length;
  const totalPhases = N + 2;

  React.useEffect(() => {
    if (!hovered) {
      setPhase(0);
      setEntered(new Set());
      return;
    }
    if (phase >= totalPhases) return;
    const delay = phase === 0 ? 200 : ABOUT_PARAGRAPH_INTERVAL_MS;
    const t = setTimeout(() => setPhase((p) => p + 1), delay);
    return () => clearTimeout(t);
  }, [hovered, phase, totalPhases]);

  React.useEffect(() => {
    const i = phase - 1;
    if (i < 0 || i >= N || entered.has(i)) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setEntered((prev) => {
          if (prev.has(i)) return prev;
          const next = new Set(prev);
          next.add(i);
          return next;
        });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase, entered, N]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="About" onClick={() => {}}>
        {children}
      </WireframeCard>

      {hovered && (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-10 w-[360px] -translate-x-1/2 pt-[var(--space-3)]"
          // eslint-disable-next-line template/no-jsx-style-prop
          style={{ height: `${2 * ABOUT_SLOT_H}px` }}
        >
          {ABOUT_PARAGRAPHS.map((p, i) => {
            if (i >= phase) return null;
            const slot = i - Math.max(0, phase - 2);
            const isEntered = entered.has(i);
            const entrySlot = i === 0 ? 0 : 1;
            const settledY = slot * ABOUT_SLOT_H;
            const preEntryY = entrySlot * ABOUT_SLOT_H + ABOUT_ENTRY_OFFSET;
            const y = isEntered ? settledY : preEntryY;
            const settledOpacity = slot >= 0 && slot <= 1 ? 1 : 0;
            const opacity = isEntered ? settledOpacity : 0;
            return (
              <div
                key={i}
                // eslint-disable-next-line template/no-jsx-style-prop
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${y}px)`,
                  opacity,
                  transition:
                    "transform 1400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 1400ms ease-out",
                }}
              >
                <p className="text-center text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolsHoverCard({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  const ITEM_H = 38;
  const items = ["Design", "Converter", "Fold"];

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="Tools" onClick={() => {}}>
        {children}
      </WireframeCard>

      <div
        className="absolute left-1/2 top-full z-10 w-[240px] -translate-x-1/2"
        // eslint-disable-next-line template/no-jsx-style-prop
        style={{
          height: items.length * ITEM_H,
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {items.map((label, i) => (
          <button
            key={label}
            type="button"
            className="absolute left-0 right-0 flex cursor-pointer items-center justify-center text-sm font-medium tracking-tight text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)] focus-visible:text-[var(--color-accent)] focus-visible:outline-none"
            // eslint-disable-next-line template/no-jsx-style-prop
            style={{
              top: i * ITEM_H,
              height: ITEM_H,
              opacity: hovered ? 1 : 0,
              transform: hovered
                ? "translateY(0)"
                : `translateY(-${i * ITEM_H}px)`,
              transition:
                "opacity 550ms ease-out, transform 650ms cubic-bezier(0.22, 1, 0.36, 1), color 200ms ease-out",
              transitionDelay: hovered ? `${i * 80}ms` : "0ms",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewProjectHoverCard({
  onCreate,
  onClickCard,
  children,
}: {
  onCreate: (name: string) => void;
  onClickCard: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [name, setName] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const measureRef = React.useRef<HTMLSpanElement>(null);
  const ITEM_H = 38;

  React.useEffect(() => {
    if (hovered) {
      const t = setTimeout(() => inputRef.current?.focus(), 650);
      return () => clearTimeout(t);
    }
    setName("");
  }, [hovered]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = name.trim();
      if (trimmed) {
        onCreate(trimmed);
        setName("");
      }
    } else if (e.key === "Escape") {
      setName("");
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="New" onClick={onClickCard}>
        {children}
      </WireframeCard>

      <div
        className="absolute left-1/2 top-full z-10 w-[240px] -translate-x-1/2"
        // eslint-disable-next-line template/no-jsx-style-prop
        style={{
          height: ITEM_H,
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        <div
          className="flex h-full items-center justify-center font-mono text-sm"
          // eslint-disable-next-line template/no-jsx-style-prop
          style={{
            opacity: hovered ? 1 : 0,
            transform: hovered ? "translateY(0)" : `translateY(-${ITEM_H}px)`,
            transition:
              "opacity 550ms ease-out, transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <span className="select-none text-[var(--color-text-muted)]">
            [&nbsp;
          </span>
          <span className="relative inline-block">
            <span
              ref={measureRef}
              aria-hidden="true"
              className="invisible whitespace-pre"
            >
              {name || "\u00a0"}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
              className="absolute inset-0 w-full border-none bg-transparent p-0 font-mono text-sm text-[var(--color-text-primary)] caret-[var(--color-accent)] outline-none focus:outline-none"
            />
          </span>
          <span className="select-none text-[var(--color-text-muted)]">
            &nbsp;]
          </span>
        </div>
      </div>
    </div>
  );
}

function OpenProjectHoverCard({
  projects,
  onSelect,
  onClickCard,
  children,
}: {
  projects: { id: number; name: string; updatedAt: string }[];
  onSelect: (project: { id: number; name: string }) => void;
  onClickCard: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = React.useState(false);
  const N = projects.length;
  const VISIBLE = 5;
  const ITEM_H = 38;
  const CONTAINER_H = VISIBLE * ITEM_H;
  const hasProjects = N > 0;
  const needsCarousel = N > VISIBLE;

  const rendered = React.useMemo(
    () => (needsCarousel ? [...projects, ...projects, ...projects] : projects),
    [projects, needsCarousel]
  );
  const MIDDLE = needsCarousel ? N : 0;
  // Anchor the most-recent project (projects[0], at rendered[MIDDLE]) in the
  // middle visible slot.
  const CENTER_SLOT = Math.floor(VISIBLE / 2);
  const ANCHOR = needsCarousel ? MIDDLE - CENTER_SLOT : -CENTER_SLOT;

  const [offset, setOffset] = React.useState(ANCHOR);
  const [animated, setAnimated] = React.useState(true);

  React.useEffect(() => {
    setOffset(ANCHOR);
  }, [ANCHOR, N]);

  React.useEffect(() => {
    if (!hovered) setOffset(ANCHOR);
  }, [hovered, ANCHOR]);

  // Snap back into the anchored window once a wrap-edge scroll has landed.
  React.useEffect(() => {
    if (!needsCarousel) return;
    if (offset >= ANCHOR && offset < ANCHOR + N) return;
    const timer = setTimeout(() => {
      setAnimated(false);
      const wrapped = ((offset - ANCHOR) % N + N) % N + ANCHOR;
      setOffset(wrapped);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true))
      );
    }, 470);
    return () => clearTimeout(timer);
  }, [offset, ANCHOR, N, needsCarousel]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!hovered || !needsCarousel) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      setAnimated(true);
      setOffset((o) => o + dir);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [hovered, needsCarousel]);

  const mostRecentId = projects[0]?.id;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="Open" onClick={onClickCard}>
        {children}
      </WireframeCard>

      {hasProjects && (
        <div
          ref={scrollRef}
          className="pointer-events-none absolute left-1/2 top-full z-10 w-[240px] -translate-x-1/2 overflow-hidden"
          // eslint-disable-next-line template/no-jsx-style-prop
          style={{
            height: CONTAINER_H,
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)",
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          <div
            className="relative"
            // eslint-disable-next-line template/no-jsx-style-prop
            style={{
              height: rendered.length * ITEM_H,
              transform: `translateY(${-offset * ITEM_H}px)`,
              transition: animated
                ? "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
            }}
          >
            {rendered.map((p, i) => {
              const visRel = i - offset;
              const inVisible = visRel >= 0 && visRel < VISIBLE;
              const entryTy = inVisible ? -visRel * ITEM_H : 0;
              const isRecent = p.id === mostRecentId;
              return (
                <button
                  key={`${i}-${p.id}`}
                  type="button"
                  onClick={() => onSelect({ id: p.id, name: p.name })}
                  // eslint-disable-next-line template/no-jsx-style-prop
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: i * ITEM_H,
                    height: ITEM_H,
                    opacity: hovered ? 1 : 0,
                    transform: hovered
                      ? "translateY(0)"
                      : `translateY(${entryTy}px)`,
                    transition:
                      "opacity 550ms ease-out, transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: hovered
                      ? `${Math.min(Math.max(0, Math.min(VISIBLE - 1, visRel)) * 80, 500)}ms`
                      : "0ms",
                  }}
                  className={cn(
                    "flex items-center justify-center text-sm tracking-tight transition-colors focus-visible:outline-none",
                    isRecent
                      ? "font-semibold text-[var(--color-accent)]"
                      : "font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]"
                  )}
                >
                  <span className="truncate px-[var(--space-2)]">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WireframeCard({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "group flex flex-col items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] p-[var(--space-4)] transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
        interactive
          ? "cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          : "cursor-default text-[var(--color-text-muted)] opacity-60"
      )}
    >
      <div className="flex h-[160px] w-[160px] items-center justify-center transition-transform duration-300 group-hover:scale-105">
        <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full">
          {children}
        </div>
      </div>
      <span className="text-xs font-medium uppercase tracking-[0.2em]">
        {label}
      </span>
    </button>
  );
}

function ProjectListItem({
  name,
  updatedAt,
  onClick,
}: {
  name: string;
  updatedAt: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-4)] py-[var(--space-3)] text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
    >
      <FolderOpen
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-[var(--color-text-muted)]"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {name}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Last modified {updatedAt}
        </span>
      </div>
      <ChevronRight
        size={14}
        strokeWidth={2}
        className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function HomeOverview() {
  const isDark = useIsDarkTheme();
  const { activeProject, setActiveProject } = useActiveProject();
  const { data: projects, isLoading: isLoadingProjects } = useProjectList();
  const createMutation = useCreateProject();

  const [showNewDialog, setShowNewDialog] = React.useState(false);
  const [showLoadDialog, setShowLoadDialog] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");

  const [landingMounted, setLandingMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setLandingMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { blocked: soundBlocked } = useLandingAmbientSound(!activeProject);

  const projectList = React.useMemo(
    () =>
      (projects ?? [])
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((p) => ({
          id: p.id,
          name: p.name,
          updatedAt: p.created_at.slice(0, 10),
        })),
    [projects]
  );

  const handleCreateProject = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (project) => {
          setActiveProject({ id: project.id, name: project.name });
          setNewProjectName("");
          setShowNewDialog(false);
        },
      }
    );
  };

  const handleInlineCreateProject = (name: string) => {
    createMutation.mutate(
      { name },
      {
        onSuccess: (project) => {
          setActiveProject({ id: project.id, name: project.name });
        },
      }
    );
  };

  const handleLoadProject = (project: { id: number; name: string }) => {
    setActiveProject(project);
    setShowLoadDialog(false);
  };

  /* ---- Welcome view (no project loaded) ---- */
  if (!activeProject) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-[var(--space-8)]">
          <div className="relative isolate">
            {landingMounted && (
              <div
                aria-hidden="true"
                className="landing-logo-glow pointer-events-none absolute left-1/2 top-1/2 h-[54px] w-[332px] rounded-full bg-[var(--color-accent)]"
                // eslint-disable-next-line template/no-jsx-style-prop
                style={{
                  filter: "blur(44px)",
                  animationDuration: "10000ms",
                  ["--logo-glow-max-opacity" as never]: 1,
                  ["--logo-glow-min-scale" as never]: 1.32,
                  ["--logo-glow-max-scale" as never]: 1.27,
                }}
              />
            )}
            <Image
              src={isDark ? "/seiseye_logo_white.png" : "/seiseye_logo_black.png"}
              alt="Seiseye"
              width={440}
              height={120}
              priority
              className={cn(
                "relative h-auto w-[320px] transition-all duration-[1400ms] ease-out",
                landingMounted
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-10 opacity-0"
              )}
            />
          </div>

          <AnimationLoop>
            <div className="flex flex-wrap justify-center gap-[var(--space-4)]">
              <NewProjectHoverCard
                onCreate={handleInlineCreateProject}
                onClickCard={() => setShowNewDialog(true)}
              >
                <SpinningCube />
              </NewProjectHoverCard>
              <OpenProjectHoverCard
                projects={projectList}
                onSelect={handleLoadProject}
                onClickCard={() => setShowLoadDialog(true)}
              >
                <PendulumWave />
              </OpenProjectHoverCard>
              <ToolsHoverCard>
                <FractalTree />
              </ToolsHoverCard>
              <AboutHoverCard>
                <WaveMesh />
              </AboutHoverCard>
            </div>
          </AnimationLoop>
        </div>

        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none fixed bottom-[var(--space-5)] left-1/2 -translate-x-1/2 select-none text-[11px] uppercase tracking-[0.3em] text-[var(--color-text-muted)] transition-opacity duration-[800ms]",
            soundBlocked ? "opacity-60" : "opacity-0"
          )}
        >
          click anywhere to enable sound
        </div>

        <NewProjectDialog
          open={showNewDialog}
          onOpenChange={setShowNewDialog}
          value={newProjectName}
          onChange={setNewProjectName}
          onSubmit={handleCreateProject}
        />
        <LoadProjectDialog
          open={showLoadDialog}
          onOpenChange={setShowLoadDialog}
          projects={projectList}
          isLoading={isLoadingProjects}
          onSelect={handleLoadProject}
        />
      </>
    );
  }

  /* ---- Active project view — settings workflow ---- */
  return (
    <>
      <div className="h-full w-full">
        <ProjectSettingsWorkflow />
      </div>

      <NewProjectDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        value={newProjectName}
        onChange={setNewProjectName}
        onSubmit={handleCreateProject}
      />
      <LoadProjectDialog
        open={showLoadDialog}
        onOpenChange={setShowLoadDialog}
        projects={projectList}
          isLoading={isLoadingProjects}
        onSelect={handleLoadProject}
      />
    </>
  );
}

/* ------------------------------------------------------------------
   Dialogs
   ------------------------------------------------------------------ */

function NewProjectDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Small delay so the dialog is rendered before focus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Project name
          </span>
          <Input
            ref={inputRef}
            placeholder="e.g. Groningen 2025"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={!value.trim()} onClick={onSubmit}>
          Create
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function LoadProjectDialog({
  open,
  onOpenChange,
  projects,
  isLoading,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: number; name: string; updatedAt: string }[];
  isLoading?: boolean;
  onSelect: (project: { id: number; name: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Load Project</DialogTitle>
      </DialogHeader>
      <DialogBody>
        {isLoading ? (
          <p className="py-[var(--space-4)] text-center text-sm text-[var(--color-text-muted)]">
            Loading projects...
          </p>
        ) : projects.length === 0 ? (
          <p className="py-[var(--space-4)] text-center text-sm text-[var(--color-text-muted)]">
            No projects found.
          </p>
        ) : (
          <div className="flex flex-col gap-[var(--space-2)]">
            {projects.map((p) => (
              <ProjectListItem
                key={p.id}
                name={p.name}
                updatedAt={p.updatedAt}
                onClick={() => onSelect({ id: p.id, name: p.name })}
              />
            ))}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
