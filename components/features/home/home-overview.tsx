"use client";

/* eslint-disable template/no-jsx-style-prop -- landing screen relies on runtime motion and positioning values */

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { appIcons } from "@/components/ui/icon";

const {
  loader: Loader,
  logIn: LogIn,
} = appIcons;

import { useActiveProject } from "@/lib/use-active-project";
import { useSoundPreference } from "@/lib/use-sound-preference";
import { useThemePreferences } from "@/lib/use-theme-preferences";
import {
  THEME_REGISTRY,
  getThemeFamilies,
  type ThemeMode,
} from "@/lib/theme";
import { Icon } from "@/components/ui/icon";
import {
  useAuthSession,
  useLoginMutation,
  useLogoutMutation,
} from "@/lib/use-auth-session";
import { getApiErrorMessage } from "@/services/api/auth";
import { useProjectList, useCreateProject } from "@/services/query/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  AnimationLoop,
  SpinningCube,
  PendulumWave,
  PendulumHighlightProvider,
  FractalTree,
  TreeHighlightProvider,
  WaveMesh,
  MeshHighlightProvider,
  DnaHelix,
  DnaHelixHighlightProvider,
  DNA_HELIX_RUNG_COUNT,
} from "./landing-wireframes";

/* ------------------------------------------------------------------
   Hooks
   ------------------------------------------------------------------ */

const AMBIENT_SOUND_SRC = "/sound/ambient-drone.mp3";
const AMBIENT_FADE_MS = 10_000;
const AMBIENT_PEAK_VOLUME = 0.3;

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
        audio.volume = Math.min(1, Math.max(0, Math.min(fadeIn, fadeOut))) * AMBIENT_PEAK_VOLUME;
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

    let disposed = false;

    audio
      .play()
      .then(() => setBlocked(false))
      .catch(() => {
        if (disposed) return;
        setBlocked(true);
        attachGesture();
      });

    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
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
  "Seiseye is a browser-based simulation platform for 3D seismic acquisition, used by oil companies and seismic contractors across planning and field operations.",
  "Configure survey designs, resources, terrain, and operational strategy, then run scenarios to optimize cost and schedule before any crew mobilizes.",
  "Outputs include field operation simulation videos, operational and financial analytics, and detailed costing with P&L and cash flow statements.",
  "Backed by 40 years of field experience, Seiseye models any operational complexity and delivers reliable forecasts far faster than traditional methods.",
];

// Phrases inside each paragraph that are permanently rendered in the accent
// colour. They appear coloured the moment the paragraph enters — no delay.
const ABOUT_HIGHLIGHTS: Record<number, string[]> = {
  0: ["simulation platform for 3D seismic acquisition"],
  1: ["optimize cost and schedule"],
  2: ["videos, operational and financial analytics"],
  3: ["any operational complexity", "reliable forecasts"],
};

function renderAboutParagraph(text: string, idx: number) {
  const phrases = ABOUT_HIGHLIGHTS[idx];
  if (!phrases || phrases.length === 0) return text;

  const spans = phrases
    .map((phrase) => ({ phrase, start: text.indexOf(phrase) }))
    .filter((s) => s.start >= 0)
    .sort((a, b) => a.start - b.start);

  if (spans.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <span
        key={i}
        // eslint-disable-next-line template/no-jsx-style-prop -- themed colour
        style={{ color: "var(--color-accent)" }}
      >
        {s.phrase}
      </span>,
    );
    cursor = s.start + s.phrase.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// Landing card-row layout constants. Cards are absolutely positioned inside
// a `relative` container so we can drive the login → logged-in transition
// with CSS transitions on each slot's translateX / opacity.
const LANDING_CARD_UNIT = 208; // card width + inter-card gap, in px.
const LANDING_OFFSCREEN_X = -520; // starting slot for NEW/OPEN/TOOLS pre-login.

function cardSlotStyle(
  x: number,
  visible: boolean,
  durationMs: number,
  delayMs: number,
): React.CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: 0,
    transform: `translate3d(calc(-50% + ${x}px), 0, 0)`,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? "auto" : "none",
    transition: `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms, opacity ${durationMs}ms ease-out ${delayMs}ms`,
  };
}

const ABOUT_STAGGER_MS = 200;
const ABOUT_INITIAL_DELAY_MS = 180;
const ABOUT_MAX_COL_W = 208; // 20 % narrower than the previous 260 px cap.
const ABOUT_COL_GAP = 24;
const ABOUT_VIEWPORT_PAD = 64;
const ABOUT_RISE_PX = 90;
const ABOUT_WIRE_LEVELS = 2;

function AboutHoverCard({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  const [revealed, setRevealed] = React.useState(0);
  const [colW, setColW] = React.useState(ABOUT_MAX_COL_W);
  const [topPx, setTopPx] = React.useState(0);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const N = ABOUT_PARAGRAPHS.length;

  // Ancestor transforms (the landing-card slot wrapper uses translate3d) turn
  // `position: fixed` into a regular absolute-ancestor layout, so the
  // paragraphs have to be rendered into `document.body` via a portal to stay
  // truly viewport-positioned.
  React.useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const measure = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const available = window.innerWidth - ABOUT_VIEWPORT_PAD * 2 - ABOUT_COL_GAP * (N - 1);
    const fit = Math.floor(available / N);
    setColW(Math.max(140, Math.min(ABOUT_MAX_COL_W, fit)));
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setTopPx(rect.bottom + 16);
    }
  }, [N]);

  React.useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  React.useEffect(() => {
    if (!hovered) {
      setRevealed(0);
      return;
    }
    if (revealed >= N) return;
    const delay = revealed === 0 ? ABOUT_INITIAL_DELAY_MS : ABOUT_STAGGER_MS;
    const t = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => clearTimeout(t);
  }, [hovered, revealed, N]);

  const rowW = N * colW + (N - 1) * ABOUT_COL_GAP;

  const handleEnter = () => {
    measure();
    setHovered(true);
  };

  return (
    <MeshHighlightProvider revealed={hovered ? ABOUT_WIRE_LEVELS : 0}>
    <div
      ref={cardRef}
      className="group relative"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="About" onClick={() => setHovered((v) => !v)}>
        {children}
      </WireframeCard>

      {portalTarget
        ? createPortal(
            <div
              className="pointer-events-none fixed left-1/2 z-10 -translate-x-1/2"
              // eslint-disable-next-line template/no-jsx-style-prop
              style={{ top: topPx, width: rowW }}
            >
              {ABOUT_PARAGRAPHS.map((p, i) => {
                const shown = hovered && i < revealed;
                return (
                  <p
                    key={i}
                    // eslint-disable-next-line template/no-jsx-style-prop
                    style={{
                      position: "absolute",
                      left: i * (colW + ABOUT_COL_GAP),
                      top: 0,
                      width: colW,
                      opacity: shown ? 1 : 0,
                      transform: shown
                        ? "translate3d(0, 0, 0)"
                        : `translate3d(0, ${ABOUT_RISE_PX}px, 0)`,
                      transition:
                        "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1), opacity 850ms ease-out",
                      hyphens: "auto",
                    }}
                    className="text-justify text-sm leading-relaxed text-[var(--color-text-secondary)]"
                  >
                    {renderAboutParagraph(p, i)}
                  </p>
                );
              })}
            </div>,
            portalTarget,
          )
        : null}
    </div>
    </MeshHighlightProvider>
  );
}

function LandingUserMenu({
  session,
}: {
  session: { email: string; is_admin: boolean };
}) {
  const logoutMutation = useLogoutMutation();
  const { prefs: themePrefs, updatePrefs: setThemePrefs } = useThemePreferences();
  const [soundOn, setSoundOn] = useSoundPreference();

  const currentThemeDef = THEME_REGISTRY.find((t) => t.id === themePrefs.mode);
  const isDark = currentThemeDef?.kind === "dark";

  const handleThemeChange = React.useCallback(
    (nextMode: ThemeMode) => {
      setThemePrefs((current) => ({ ...current, mode: nextMode }));
    },
    [setThemePrefs],
  );

  const toggleDarkMode = React.useCallback(() => {
    setThemePrefs((current) => {
      const def = THEME_REGISTRY.find((t) => t.id === current.mode);
      const fallback = def?.kind === "dark" ? "default" : "dark";
      return { ...current, mode: (def?.counterpart ?? fallback) as ThemeMode };
    });
  }, [setThemePrefs]);

  const handleLogout = React.useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  return (
    <div className="flex items-center gap-[var(--space-1)]">
      <Button
        variant="ghost"
        size="sm"
        aria-label={isDark ? "Switch to light" : "Switch to dark"}
        onClick={toggleDarkMode}
      >
        <Icon icon={isDark ? appIcons.sun : appIcons.moon} />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Change theme">
            <Icon icon={appIcons.palette} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-[var(--space-2)]">
          <div className="flex flex-col gap-[var(--space-1)]">
            <p className="px-[var(--space-3)] pb-[var(--space-1)] pt-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
              Theme
            </p>
            {getThemeFamilies().map((family) => {
              // Picker always lands on the family's dark variant; the
              // sun/moon toggle handles the kind switch. One row per
              // family — no separate light/dark entries.
              const targetId = family.darkId;
              const currentFamily = THEME_REGISTRY.find(
                (t) => t.id === themePrefs.mode,
              )?.family;
              const isActive = currentFamily === family.family;
              return (
                <button
                  key={family.family}
                  type="button"
                  onClick={() => handleThemeChange(targetId)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm transition-colors",
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-medium text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]",
                  )}
                >
                  <span>{family.family}</span>
                  {family.description && (
                    <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                      {family.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        aria-label={soundOn ? "Mute ambient sound" : "Unmute ambient sound"}
        aria-pressed={soundOn}
        onClick={() => setSoundOn(!soundOn)}
      >
        <Icon icon={soundOn ? appIcons.volume2 : appIcons.volumeX} />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Open session menu">
            <Icon icon={appIcons.user} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-[var(--space-4)]">
            <div className="space-y-[var(--space-2)]">
              <div className="flex items-center gap-[var(--space-2)]">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {session.email}
                </p>
                <Badge variant={session.is_admin ? "accent" : "outline"}>
                  {session.is_admin ? "Admin" : "User"}
                </Badge>
              </div>
            </div>
            {logoutMutation.error ? (
              <p className="text-xs text-[var(--color-status-danger)]">
                {getApiErrorMessage(logoutMutation.error, "Sign-out failed.")}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
              >
                {logoutMutation.isPending ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LoginBracketInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  type = "text",
  autoComplete,
  autoFocus,
  registerInput,
  onDomSync,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: "text" | "password";
  autoComplete?: string;
  autoFocus?: boolean;
  registerInput?: (node: HTMLInputElement | null) => void;
  onDomSync?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const syncDomValue = React.useEffectEvent(() => {
    const nextValue = inputRef.current?.value ?? "";
    if (nextValue !== value) {
      onChange(nextValue);
    }
  });

  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      registerInput?.(node);
    },
    [registerInput],
  );

  React.useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 600);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Browser autofill often writes the DOM value without firing a synthetic
  // `change` React can observe, and can happen long after mount (e.g. when
  // the input first becomes visible or focused). Poll the DOM value for the
  // lifetime of the component so the state catches up — otherwise the
  // measurement span stays at placeholder width (clipping the visible value)
  // and the sign-in button stays disabled.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const interval = window.setInterval(() => {
      syncDomValue();
    }, 80);
    return () => window.clearInterval(interval);
  }, []);

  // One trailing nbsp of slack so the input never clips its last character:
  // Chromium's autofill can render the value a sub-pixel wider than the
  // measurement span and the native `<input>` silently hides the overflow.
  const measureText =
    (type === "password" ? "•".repeat(value.length) : value) || placeholder;

  return (
    <div className="flex items-center justify-center font-mono text-sm font-normal">
      <span className="select-none text-[var(--color-text-muted)]">[&nbsp;</span>
      <span className="relative inline-block">
        <span aria-hidden="true" className="invisible whitespace-pre font-normal">
          {measureText}
          {" "}
        </span>
        <input
          ref={setInputRef}
          type={type}
          defaultValue=""
          onInput={(e) => onChange(e.currentTarget.value)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            syncDomValue();
            onDomSync?.();
          }}
          autoComplete={autoComplete}
          spellCheck={false}
          placeholder={placeholder}
          className={cn(
            "absolute inset-0 w-full border-none bg-transparent p-0 font-mono text-sm font-normal text-[var(--color-text-primary)] caret-[var(--color-accent)] outline-none focus:outline-none",
            "placeholder:font-normal placeholder:text-[var(--color-text-muted)] placeholder:opacity-70",
          )}
        />
      </span>
      <span className="select-none text-[var(--color-text-muted)]">&nbsp;]</span>
    </div>
  );
}

function LoginHoverCard({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  const [rungsLit, setRungsLit] = React.useState(0);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const usernameInputRef = React.useRef<HTMLInputElement>(null);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);
  const syncTimeoutsRef = React.useRef<number[]>([]);
  const loginMutation = useLoginMutation();
  const ITEM_H = 38;
  const items = 3;

  const clearScheduledCredentialSyncs = React.useCallback(() => {
    syncTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    syncTimeoutsRef.current = [];
  }, []);

  const syncCredentialsFromDom = React.useCallback(() => {
    const nextUsername = usernameInputRef.current?.value ?? "";
    const nextPassword = passwordInputRef.current?.value ?? "";
    setUsername((current) => (current === nextUsername ? current : nextUsername));
    setPassword((current) => (current === nextPassword ? current : nextPassword));
  }, []);

  const scheduleCredentialSync = React.useCallback(() => {
    clearScheduledCredentialSyncs();
    syncCredentialsFromDom();
    queueMicrotask(syncCredentialsFromDom);
    syncTimeoutsRef.current = [
      window.setTimeout(syncCredentialsFromDom, 0),
      window.setTimeout(syncCredentialsFromDom, 120),
    ];
  }, [clearScheduledCredentialSyncs, syncCredentialsFromDom]);

  React.useEffect(() => clearScheduledCredentialSyncs, [clearScheduledCredentialSyncs]);

  React.useEffect(() => {
    if (!hovered) {
      clearScheduledCredentialSyncs();
      return;
    }
    scheduleCredentialSync();
  }, [hovered, clearScheduledCredentialSyncs, scheduleCredentialSync]);

  // Bottom-to-top rung cascade on hover: one rung + its two extremities flip
  // to the accent colour every 1 s until the ladder is fully lit. Leaving the
  // card resets the cascade so the next hover starts from the bottom again.
  React.useEffect(() => {
    if (!hovered) {
      setRungsLit(0);
      return;
    }
    if (rungsLit >= DNA_HELIX_RUNG_COUNT) return;
    const t = setTimeout(() => setRungsLit((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [hovered, rungsLit]);

  const canSubmit =
    username.trim().length > 0 &&
    password.length > 0 &&
    !loginMutation.isPending;
  const handleSubmit = async () => {
    const nextUsername = usernameInputRef.current?.value ?? username;
    const nextPassword = passwordInputRef.current?.value ?? password;
    const trimmedUsername = nextUsername.trim();

    if (nextUsername !== username) setUsername(nextUsername);
    if (nextPassword !== password) setPassword(nextPassword);

    if (!trimmedUsername.length || !nextPassword.length || loginMutation.isPending) {
      return;
    }
    setError(null);
    try {
      await loginMutation.mutateAsync({
        username: trimmedUsername,
        password: nextPassword,
      });
    } catch (submitError) {
      setError(
        getApiErrorMessage(submitError, "Sign-in failed. Please try again."),
      );
    }
  };
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void handleSubmit();
  };

  return (
    <DnaHelixHighlightProvider rungsLit={rungsLit}>
    <div
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="Login" onClick={() => void handleSubmit()}>
        {children}
      </WireframeCard>

      <div
        className="absolute left-1/2 top-full z-10 w-[240px] -translate-x-1/2"
        onPointerDownCapture={scheduleCredentialSync}
        // eslint-disable-next-line template/no-jsx-style-prop
        style={{
          height: items * ITEM_H,
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {[
          <LoginBracketInput
            key="u"
            value={username}
            onChange={setUsername}
            onKeyDown={handleKey}
            placeholder="email"
            autoComplete="username"
            autoFocus={hovered}
            registerInput={(node) => {
              usernameInputRef.current = node;
            }}
            onDomSync={scheduleCredentialSync}
          />,
          <LoginBracketInput
            key="p"
            value={password}
            onChange={setPassword}
            onKeyDown={handleKey}
            placeholder="password"
            type="password"
            autoComplete="current-password"
            registerInput={(node) => {
              passwordInputRef.current = node;
            }}
            onDomSync={scheduleCredentialSync}
          />,
          <div key="s" className="flex flex-col items-center gap-[var(--space-1)]">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loginMutation.isPending}
              aria-disabled={!canSubmit && !loginMutation.isPending}
              aria-label={loginMutation.isPending ? "Signing in" : "Sign in"}
              className={cn(
                "flex items-center justify-center transition-colors",
                loginMutation.isPending
                  ? "cursor-not-allowed text-[var(--color-text-muted)] opacity-40"
                  : canSubmit
                  ? "cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                  : "cursor-pointer text-[var(--color-text-muted)] opacity-40 hover:text-[var(--color-accent)]",
              )}
            >
              {loginMutation.isPending ? (
                <Loader size={18} strokeWidth={1.75} className="animate-spin" />
              ) : (
                <LogIn size={18} strokeWidth={1.75} />
              )}
            </button>
            {error ? (
              <p
                role="alert"
                className="text-center font-mono text-[10px] text-[var(--color-status-danger)]"
              >
                {error}
              </p>
            ) : null}
          </div>,
        ].map((node, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 flex h-[38px] items-center justify-center"
            // eslint-disable-next-line template/no-jsx-style-prop
            style={{
              top: i * ITEM_H,
              opacity: hovered ? 1 : 0,
              transform: hovered ? "translateY(0)" : `translateY(-${i * ITEM_H}px)`,
              transition:
                "opacity 550ms ease-out, transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
              transitionDelay: hovered ? `${i * 80}ms` : "0ms",
            }}
          >
            {node}
          </div>
        ))}
      </div>
    </div>
    </DnaHelixHighlightProvider>
  );
}

function ToolsHoverCard({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false);
  const [hoveredToolIdx, setHoveredToolIdx] = React.useState<number | null>(null);
  const ITEM_H = 38;
  const items = ["Design", "Converter", "Fold", "Costing", "Gis Studio"];

  return (
    <TreeHighlightProvider index={hoveredToolIdx}>
      <div
        className="group relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setHoveredToolIdx(null);
        }}
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
              onMouseEnter={() => setHoveredToolIdx(i)}
              onMouseLeave={() => setHoveredToolIdx(null)}
              className="absolute left-0 right-0 flex cursor-pointer items-center justify-center text-sm font-normal tracking-tight text-[var(--color-text-primary)] transition-colors hover:font-semibold hover:text-[var(--color-accent)] focus-visible:text-[var(--color-accent)] focus-visible:outline-none"
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
    </TreeHighlightProvider>
  );
}

function NewProjectHoverCard({
  onCreate,
  children,
}: {
  onCreate: (name: string) => void;
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
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <WireframeCard label="New" onClick={() => {}}>
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
  const [hoveredProjectIdx, setHoveredProjectIdx] = React.useState<number | null>(null);
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
    if (!hovered) {
      setOffset(ANCHOR);
      setHoveredProjectIdx(null);
    }
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
    <PendulumHighlightProvider index={hoveredProjectIdx}>
    <div
      className="group relative"
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
              const originalIdx = i % N;
              return (
                <button
                  key={`${i}-${p.id}`}
                  type="button"
                  onClick={() => onSelect({ id: p.id, name: p.name })}
                  onMouseEnter={() => setHoveredProjectIdx(originalIdx)}
                  onMouseLeave={() => setHoveredProjectIdx(null)}
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
                  className="group/proj relative flex items-center justify-center text-sm font-normal tracking-tight text-[var(--color-text-primary)] transition-colors hover:font-semibold hover:text-[var(--color-accent)] focus-visible:outline-none"
                >
                  {isRecent ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      // eslint-disable-next-line template/no-jsx-style-prop -- themed blurred glow
                      style={{
                        background: "var(--color-accent)",
                        filter: "blur(14px)",
                        opacity: 0.35,
                      }}
                    />
                  ) : null}
                  <span className="relative truncate px-[var(--space-2)]">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </PendulumHighlightProvider>
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
        "flex flex-col items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] p-[var(--space-4)] transition-all duration-200 outline-none focus:outline-none focus-visible:outline-none",
        interactive
          ? "cursor-pointer text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]"
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


/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function HomeOverview() {
  const router = useRouter();
  const isDark = useIsDarkTheme();
  const { activeProject, setActiveProject } = useActiveProject();
  const { data: projects } = useProjectList();
  const createMutation = useCreateProject();

  const [landingMounted, setLandingMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setLandingMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Drive the card-row transition straight off the real auth session: the
  // moment `useAuthSession` returns a session the landing flips from the
  // 2-card (LOGIN + ABOUT) layout to the 4-card (NEW + OPEN + TOOLS + ABOUT)
  // layout — no separate local flag to keep in sync.
  const { data: session } = useAuthSession();
  const loggedIn = !!session;

  // Session dropped (sign-out, expired) — drop any remembered project so
  // HomeOverview renders the landing shell instead of the last workflow.
  React.useEffect(() => {
    if (!session && activeProject) {
      setActiveProject(null);
    }
  }, [session, activeProject, setActiveProject]);

  const [soundOn] = useSoundPreference();
  const { blocked: soundBlocked } = useLandingAmbientSound(
    soundOn && !activeProject,
  );

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

  const handleInlineCreateProject = (name: string) => {
    createMutation.mutate(
      { name },
      {
        onSuccess: (project) => {
          setActiveProject({ id: project.id, name: project.name });
          router.push("/project/definition");
        },
      }
    );
  };

  const handleLoadProject = (project: { id: number; name: string }) => {
    setActiveProject(project);
    router.push("/project/definition");
  };

  const handleOpenLastProject = () => {
    const last = projectList[0];
    if (last) handleLoadProject({ id: last.id, name: last.name });
  };

  return (
    <>
        {/* User menu — drops down from above once `loggedIn` flips true, a
            touch after the card row starts cascading in. Renders an empty
            slot when no session so the transform can animate from -200%. */}
        <div
          className="fixed right-[var(--space-4)] top-[var(--space-4)] z-20 transition-all duration-[900ms] ease-out"
          // eslint-disable-next-line template/no-jsx-style-prop -- animated
          style={{
            transform: loggedIn ? "translateY(0)" : "translateY(-220%)",
            opacity: loggedIn ? 1 : 0,
            pointerEvents: loggedIn ? "auto" : "none",
            transitionDelay: loggedIn ? "600ms" : "300ms",
          }}
        >
          {session ? (
            <LandingUserMenu session={session} />
          ) : null}
        </div>

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
            <div className="relative h-[220px] w-full">
              {/* LOGIN — centred-left of a 2-card layout when logged out; fades in place on login.
                  Sign-in: fades out first (0ms). Sign-out: fades in last (1150ms). */}
              <div
                style={cardSlotStyle(
                  -LANDING_CARD_UNIT / 2,
                  !loggedIn,
                  650,
                  loggedIn ? 0 : 1150,
                )}
              >
                <LoginHoverCard>
                  <DnaHelix />
                </LoginHoverCard>
              </div>

              {/* NEW / OPEN / TOOLS — start offscreen-left + invisible, slide into
                  their 4-card positions once loggedIn flips true. Sign-in arrival
                  order is TOOLS → OPEN → NEW (left-most NEW lands last). Sign-out
                  departs in the reverse order: NEW → OPEN → TOOLS. */}
              <div
                style={cardSlotStyle(
                  loggedIn ? -1.5 * LANDING_CARD_UNIT : LANDING_OFFSCREEN_X,
                  loggedIn,
                  800,
                  loggedIn ? 1000 : 0,
                )}
              >
                <NewProjectHoverCard onCreate={handleInlineCreateProject}>
                  <SpinningCube />
                </NewProjectHoverCard>
              </div>
              <div
                style={cardSlotStyle(
                  loggedIn ? -0.5 * LANDING_CARD_UNIT : LANDING_OFFSCREEN_X,
                  loggedIn,
                  800,
                  loggedIn ? 700 : 300,
                )}
              >
                <OpenProjectHoverCard
                  projects={projectList}
                  onSelect={handleLoadProject}
                  onClickCard={handleOpenLastProject}
                >
                  <PendulumWave />
                </OpenProjectHoverCard>
              </div>
              <div
                style={cardSlotStyle(
                  loggedIn ? 0.5 * LANDING_CARD_UNIT : LANDING_OFFSCREEN_X,
                  loggedIn,
                  800,
                  loggedIn ? 400 : 600,
                )}
              >
                <ToolsHoverCard>
                  <FractalTree />
                </ToolsHoverCard>
              </div>

              {/* ABOUT — shifts from the right slot of the 2-card layout to the
                  rightmost slot of the 4-card layout. Sign-in: shifts early (200ms).
                  Sign-out: shifts back late (500ms) so it is one of the last to move. */}
              <div
                style={cardSlotStyle(
                  loggedIn ? 1.5 * LANDING_CARD_UNIT : LANDING_CARD_UNIT / 2,
                  true,
                  1100,
                  loggedIn ? 200 : 500,
                )}
              >
                <AboutHoverCard>
                  <WaveMesh />
                </AboutHoverCard>
              </div>
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
      </>
  );
}
