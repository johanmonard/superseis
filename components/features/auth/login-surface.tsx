"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession, useLoginMutation } from "@/lib/use-auth-session";
import { getApiErrorMessage } from "@/services/api/auth";
import { appConfig } from "@/config/app.config";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginSurface() {
  const router = useRouter();
  const { data: session, isLoading, error: sessionError } = useAuthSession();
  const loginMutation = useLoginMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || loginMutation.isPending) {
      return;
    }

    setError(null);

    try {
      await loginMutation.mutateAsync({
        username: username.trim(),
        password,
      });
      router.replace("/");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Sign-in failed. Please try again."));
    }
  };

  if (!isLoading && session) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-2">
          <CardTitle className="text-lg tracking-wide">{appConfig.name}</CardTitle>
          <CardDescription>
            Sign in to continue.
            <br />
            Enter your email and password to sign in.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <CardContent className="space-y-3">
          <Field label="Email" htmlFor="username">
            <Input
              id="username"
              name="username"
              autoComplete="username"
              placeholder="Email"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {sessionError ? (
            <p className="text-xs text-[var(--color-status-danger)]">
              {getApiErrorMessage(
                sessionError,
                "The template API is not reachable. Start the backend and try again."
              )}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-[var(--color-status-danger)]">
              {error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter>
          <Button
            type="submit"
            className="w-full"
            disabled={!canSubmit || loginMutation.isPending}
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
