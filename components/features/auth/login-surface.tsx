"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { useAuthSession, useLoginMutation } from "@/lib/use-auth-session";
import { getApiErrorMessage } from "@/services/api/auth";
import { cn } from "@/lib/utils";

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsDark(
        document.documentElement.getAttribute("data-theme-kind") === "dark",
      );
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

function BracketInput({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  type = "text",
  autoComplete,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: "text" | "password";
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 900);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const measureText =
    type === "password"
      ? "•".repeat(value.length) || placeholder
      : value || placeholder;

  return (
    <div className="flex items-center justify-center font-mono text-sm">
      <span className="select-none text-[var(--color-text-muted)]">
        [&nbsp;
      </span>
      <span className="relative inline-block">
        <span
          aria-hidden="true"
          className="invisible whitespace-pre"
        >
          {measureText}
        </span>
        <input
          ref={inputRef}
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete={autoComplete}
          spellCheck={false}
          placeholder={value ? "" : placeholder}
          className={cn(
            "absolute inset-0 w-full border-none bg-transparent p-0 font-mono text-sm text-[var(--color-text-primary)] caret-[var(--color-accent)] outline-none focus:outline-none",
            "placeholder:text-[var(--color-text-muted)] placeholder:opacity-70",
          )}
        />
      </span>
      <span className="select-none text-[var(--color-text-muted)]">
        &nbsp;]
      </span>
    </div>
  );
}

export function LoginSurface() {
  const router = useRouter();
  const isDark = useIsDarkTheme();
  const { data: session, isLoading, error: sessionError } = useAuthSession();
  const loginMutation = useLoginMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!isLoading && session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || loginMutation.isPending) return;
    setError(null);
    try {
      await loginMutation.mutateAsync({
        username: username.trim(),
        password,
      });
      router.replace("/");
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          "Sign-in failed. Please try again.",
        ),
      );
    }
  };

  if (!isLoading && session) return null;

  const errorMessage =
    error ??
    (sessionError
      ? getApiErrorMessage(
          sessionError,
          "The API is not reachable. Start the backend and try again.",
        )
      : null);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center gap-[72px]"
    >
      <div className="relative isolate">
        {mounted && (
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
            mounted
              ? "translate-y-0 opacity-100"
              : "-translate-y-10 opacity-0",
          )}
        />
      </div>

      <div className="flex flex-col items-center gap-[var(--space-4)]">
        <BracketInput
          id="username"
          value={username}
          onChange={setUsername}
          placeholder="email"
          autoComplete="username"
          autoFocus
        />
        <BracketInput
          id="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="password"
          autoComplete="current-password"
        />

        <div className="min-h-[20px]">
          {errorMessage ? (
            <p
              role="alert"
              className="text-center font-mono text-xs text-[var(--color-status-danger)]"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!canSubmit || loginMutation.isPending}
          className={cn(
            "font-mono text-xs uppercase tracking-[0.3em] transition-colors",
            "text-[var(--color-text-muted)] hover:text-[var(--color-accent)]",
            "focus-visible:text-[var(--color-accent)] focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[var(--color-text-muted)]",
          )}
        >
          {loginMutation.isPending ? "signing in..." : "sign in"}
        </button>
      </div>
    </form>
  );
}
