#!/usr/bin/env node

/**
 * Production readiness preflight check.
 *
 * Run via: npm run preflight
 *
 * Checks that common deployment mistakes are caught before pushing to
 * production. Exits with code 1 if any critical issue is found.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const warnings = [];
const errors = [];

function warn(msg) {
  warnings.push(msg);
}

function fail(msg) {
  errors.push(msg);
}

/**
 * Parse a dotenv-style file into a key→value map.
 * Supports KEY=VALUE lines; ignores comments and blank lines.
 */
async function parseEnvFile(filePath) {
  const vars = {};
  try {
    const content = await fs.readFile(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      vars[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
  } catch {
    // File missing — return empty map.
  }
  return vars;
}

// ---------------------------------------------------------------------------
// 1. Auth stub still in place?
// ---------------------------------------------------------------------------
async function checkAuthStub() {
  const filesToCheck = [
    path.join(root, "api", "auth.py"),
    path.join(root, "api", "routes", "auth.py"),
  ];

  for (const filePath of filesToCheck) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      if (content.includes("DEVELOPMENT AUTH STUB") || content.includes("dev-stub")) {
        fail(
          `Auth stub detected in ${path.relative(root, filePath)} — replace with a real auth provider before deploying.\n` +
          "  Setting NEXT_PUBLIC_AUTH_PROVIDER alone is not enough; the backend auth must also be replaced.\n" +
          "  See AGENTS.md > Auth Provider Replacement."
        );
      }
    } catch {
      // File missing is fine — may have been replaced entirely.
    }
  }
}

// ---------------------------------------------------------------------------
// 2. NEXT_PUBLIC_AUTH_PROVIDER set?
// ---------------------------------------------------------------------------
async function checkAuthProvider() {
  // Check both .env.local (the file the user edits) and process.env (platform vars).
  const envLocal = await parseEnvFile(path.join(root, ".env.local"));
  const value = envLocal.NEXT_PUBLIC_AUTH_PROVIDER || process.env.NEXT_PUBLIC_AUTH_PROVIDER;

  if (!value) {
    warn(
      "NEXT_PUBLIC_AUTH_PROVIDER is not set in .env.local or your environment.\n" +
      "  Production builds will fail without it. Set it to your provider name."
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Default secrets still in use?
// ---------------------------------------------------------------------------
async function checkDefaultSecrets() {
  const envPath = path.join(root, "api", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");

    if (content.includes("dev-key-change-me") || content.includes("dev-key-change-in-production")) {
      fail(
        "APP_API_KEY is still set to the development default in api/.env.\n" +
        "  Generate a strong random key: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
      );
    }

    if (content.includes("replace-this-before-sharing") || content.includes("change-this-in-production")) {
      fail(
        "APP_SESSION_SECRET is still set to the development default in api/.env.\n" +
        "  Generate a strong random secret: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
      );
    }
  } catch {
    warn(
      "No api/.env file found. Backend environment variables must be configured\n" +
      "  via your deployment platform or a .env file before the API will work."
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Database still SQLite?
// ---------------------------------------------------------------------------
async function checkDatabase() {
  const envPath = path.join(root, "api", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    if (content.includes("sqlite")) {
      warn(
        "DATABASE_URL points to SQLite in api/.env.\n" +
        "  SQLite is fine for local development, but use Postgres for production.\n" +
        "  Add asyncpg to api/requirements.txt and update the connection string."
      );
    }
  } catch {
    // Already warned above.
  }
}

// ---------------------------------------------------------------------------
// 5. CORS origins still localhost?
// ---------------------------------------------------------------------------
async function checkCors() {
  const envPath = path.join(root, "api", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    const corsLine = content.split("\n").find((l) => l.startsWith("APP_CORS_ORIGINS="));
    if (corsLine && (corsLine.includes("localhost") || corsLine.includes("127.0.0.1"))) {
      warn(
        "APP_CORS_ORIGINS still references localhost in api/.env.\n" +
        "  Set it to your production frontend URL before deploying."
      );
    }
  } catch {
    // Already warned above.
  }
}

// ---------------------------------------------------------------------------
// 6. Secure cookie flag
// ---------------------------------------------------------------------------
async function checkSecureCookie() {
  const envPath = path.join(root, "api", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    const line = content.split("\n").find((l) => l.startsWith("APP_SESSION_SECURE_COOKIE="));
    if (line && !line.includes("true")) {
      warn(
        "APP_SESSION_SECURE_COOKIE is not set to 'true' in api/.env.\n" +
        "  Enable it when serving over HTTPS (required for production)."
      );
    }
  } catch {
    // Already warned above.
  }
}

// ---------------------------------------------------------------------------
// 7. Asyncpg in requirements for Postgres?
// ---------------------------------------------------------------------------
async function checkAsyncpg() {
  const reqPath = path.join(root, "api", "requirements.txt");
  try {
    const content = await fs.readFile(reqPath, "utf8");
    if (!content.includes("asyncpg")) {
      warn(
        "asyncpg is not listed in api/requirements.txt.\n" +
        "  If you plan to use Postgres, add: asyncpg>=0.29,<1.0"
      );
    }
  } catch {
    // Missing requirements.txt is unusual but not fatal for this check.
  }
}

// ---------------------------------------------------------------------------
// 8. Auth cookie / split-origin mismatch
// ---------------------------------------------------------------------------
async function checkAuthCookieMismatch() {
  const backendEnv = await parseEnvFile(path.join(root, "api", ".env"));
  const frontendEnv = await parseEnvFile(path.join(root, ".env.local"));

  const corsRaw = backendEnv.APP_CORS_ORIGINS || "";
  const apiBase = frontendEnv.NEXT_PUBLIC_API_BASE_URL || "";
  const samesite = (backendEnv.APP_SESSION_SAMESITE || "lax").toLowerCase();
  const secureCookie = (backendEnv.APP_SESSION_SECURE_COOKIE || "false").toLowerCase();

  // Detect split-origin: CORS origins and API base URL are on different hosts
  const corsOrigins = corsRaw.split(",").map((o) => o.trim()).filter(Boolean);

  // If still on localhost defaults, skip — this check is about production deployments.
  // localhost and 127.0.0.1 are treated as equivalent for cookie purposes in local dev.
  const allLocal = corsOrigins.every(
    (o) => o.includes("localhost") || o.includes("127.0.0.1"),
  );
  const apiBaseIsLocal =
    !apiBase || apiBase.includes("localhost") || apiBase.includes("127.0.0.1");
  if (allLocal && apiBaseIsLocal) return;

  // Check if frontend and backend would be on different origins
  let isSplitOrigin = false;
  if (apiBase) {
    try {
      const apiHost = new URL(apiBase).hostname;
      isSplitOrigin = corsOrigins.some((o) => {
        try {
          return new URL(o).hostname !== apiHost;
        } catch {
          return false;
        }
      });
    } catch {
      // Can't parse — skip this check
      return;
    }
  }

  if (isSplitOrigin && samesite === "lax") {
    fail(
      "Auth cookie / split-origin mismatch detected.\n" +
      "  Frontend and backend are on different origins, but APP_SESSION_SAMESITE is 'lax'.\n" +
      "  Cross-origin cookies require SameSite=none and Secure=true.\n" +
      "  Set APP_SESSION_SAMESITE=none and APP_SESSION_SECURE_COOKIE=true in api/.env,\n" +
      "  or switch to token-in-header auth to avoid cross-origin cookie issues entirely."
    );
  }

  if (isSplitOrigin && samesite === "none" && secureCookie !== "true") {
    fail(
      "SameSite=none requires Secure=true.\n" +
      "  APP_SESSION_SAMESITE is 'none' but APP_SESSION_SECURE_COOKIE is not 'true'.\n" +
      "  Browsers will reject the cookie silently. Set APP_SESSION_SECURE_COOKIE=true."
    );
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------
await checkAuthStub();
await checkAuthProvider();
await checkDefaultSecrets();
await checkDatabase();
await checkCors();
await checkSecureCookie();
await checkAsyncpg();
await checkAuthCookieMismatch();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log("");
console.log("=== Preflight Check ===");
console.log("");

if (errors.length === 0 && warnings.length === 0) {
  console.log("All checks passed. Ready for deployment.");
  console.log("");
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) {
    console.log("");
    console.log(`  ⚠  ${w}`);
  }
  console.log("");
}

if (errors.length > 0) {
  console.log(`Errors (${errors.length}):`);
  for (const e of errors) {
    console.log("");
    console.log(`  ✖  ${e}`);
  }
  console.log("");
  console.log("Fix the errors above before deploying to production.");
  console.log("");
  process.exit(1);
}

console.log("No blocking errors found, but review the warnings above.");
console.log("");
