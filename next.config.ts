import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Production safety: block `next build` when the development auth stub is
// still active.  The check is skipped during `next typegen` / `next dev` so
// that lint, typecheck, and dev workflows are not blocked on a fresh clone.
// Also skipped in CI environments (process.env.CI is set by GitHub Actions,
// CircleCI, GitLab CI, etc.) — CI validates that the build compiles; auth
// provider readiness is a deployment concern, not a CI concern.
// Set NEXT_PUBLIC_AUTH_PROVIDER to any non-empty value to dismiss in other envs.
// ---------------------------------------------------------------------------
const isProductionBuild =
  process.env.NODE_ENV === "production" && process.argv.includes("build");

if (isProductionBuild && !process.env.CI && !process.env.NEXT_PUBLIC_AUTH_PROVIDER) {
  throw new Error(
    [
      "Build blocked: NEXT_PUBLIC_AUTH_PROVIDER is not set.",
      "The development auth stub must be replaced before production builds.",
      "Set NEXT_PUBLIC_AUTH_PROVIDER to your auth provider name (e.g. 'oauth', 'supabase').",
      "See AGENTS.md > Auth Provider Replacement for details.",
    ].join("\n")
  );
}

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone folder for Docker deployments.
  // See docs/deployment.md > Path 1: Docker Compose.
  output: "standalone",
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default nextConfig;
