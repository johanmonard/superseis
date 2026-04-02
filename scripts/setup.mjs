#!/usr/bin/env node

/**
 * First-time environment setup.
 *
 * Run via: npm run setup
 *
 * Copies .env.example files to their working counterparts (if they don't
 * already exist) and generates random secrets for the backend .env.
 *
 * Flags:
 *   --keep-reference   Keep the bundled Demo and Admin reference surfaces.
 *   --trim-reference   Remove the bundled Demo and Admin reference surfaces.
 *
 * If neither flag is passed and stdin is a TTY, the user is prompted.
 * In non-interactive environments (CI, agents) the default is --keep-reference.
 */

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const flags = new Set(process.argv.slice(2));
const root = process.cwd();

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(src, dest, transform) {
  if (await fileExists(dest)) {
    console.log(`  ✓  ${path.relative(root, dest)} already exists — skipping.`);
    return false;
  }

  let content = await fs.readFile(src, "utf8");
  if (transform) {
    content = transform(content);
  }
  await fs.writeFile(dest, content, "utf8");
  console.log(`  ✔  Created ${path.relative(root, dest)}`);
  return true;
}

console.log("");
console.log("=== Environment Setup ===");
console.log("");

// Frontend: .env.example → .env.local
await copyIfMissing(
  path.join(root, ".env.example"),
  path.join(root, ".env.local"),
);

// Backend: api/.env.example → api/.env (with generated secrets)
const created = await copyIfMissing(
  path.join(root, "api", ".env.example"),
  path.join(root, "api", ".env"),
  (content) =>
    content
      .replace("APP_API_KEY=dev-key-change-me", `APP_API_KEY=${randomSecret()}`)
      .replace(
        "APP_SESSION_SECRET=replace-this-before-sharing-the-app",
        `APP_SESSION_SECRET=${randomSecret()}`,
      ),
);

console.log("");
if (created) {
  console.log("  Backend secrets were auto-generated for local development.");
  console.log("  Review api/.env and adjust values if needed.");
} else {
  console.log("  No files were created — your environment is already set up.");
}
console.log("");

// ---------------------------------------------------------------------------
// Reference surface cleanup (Demo + Admin + Items sample)
// ---------------------------------------------------------------------------

async function askTrimReference() {
  if (flags.has("--trim-reference")) return true;
  if (flags.has("--keep-reference")) return false;

  // Non-interactive: keep by default
  if (!process.stdin.isTTY) return false;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "Remove bundled Demo/Admin reference surfaces? (y/N) ",
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      },
    );
  });
}

const shouldTrim = await askTrimReference();

if (shouldTrim) {
  console.log("=== Trimming Reference Surfaces ===");
  console.log("");

  const modulesToRemove = ["demo", "admin"];
  const removeScript = path.join(root, "scripts", "remove-module.mjs");

  for (const mod of modulesToRemove) {
    const routeDir = path.join(root, "app", "(workspace)", mod);
    const componentDir = path.join(root, "components", "features", mod);

    try {
      await fs.access(routeDir);
    } catch {
      console.log(`  -  ${mod} not found — skipping.`);
      continue;
    }

    try {
      execSync(`node "${removeScript}" ${mod}`, { cwd: root, stdio: "inherit" });
    } catch {
      console.log(`  ⚠  Failed to remove ${mod} — remove manually.`);
    }
  }

  // Remove items reference files (backend + frontend)
  const itemsFiles = [
    "api/routes/items.py",
    "services/api/items.ts",
    "services/query/items.ts",
  ];

  for (const relPath of itemsFiles) {
    const absPath = path.join(root, relPath);
    try {
      await fs.access(absPath);
      await fs.rm(absPath);
      console.log(`  ✔  Removed ${relPath}`);
    } catch {
      // Already gone
    }
  }

  // Remove the reference card from home-overview.tsx
  const homeOverviewPath = path.join(root, "components", "features", "home", "home-overview.tsx");
  try {
    let homeOverview = await fs.readFile(homeOverviewPath, "utf8");
    const startMarker = "{/* [reference-surface:home-card] */}";
    const endMarker = "{/* [/reference-surface:home-card] */}";
    const startIdx = homeOverview.indexOf(startMarker);
    const endIdx = homeOverview.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
      homeOverview =
        homeOverview.slice(0, startIdx).trimEnd() +
        "\n" +
        homeOverview.slice(endIdx + endMarker.length);
      await fs.writeFile(homeOverviewPath, homeOverview, "utf8");
      console.log("  \u2714  Cleaned reference card from components/features/home/home-overview.tsx");
    }
  } catch {
    // home-overview.tsx missing or already clean
  }

  // Remove items router registration from app.py
  const appPyPath = path.join(root, "api", "app.py");
  try {
    let appPy = await fs.readFile(appPyPath, "utf8");
    appPy = appPy
      .replace(/^from api\.routes\.items import router as items_router\n?/m, "")
      .replace(/^app\.include_router\(items_router\)\n?/m, "");
    await fs.writeFile(appPyPath, appPy, "utf8");
    console.log("  ✔  Cleaned items router from api/app.py");
  } catch {
    // app.py missing or already clean
  }

  console.log("");
  console.log("  Reference surfaces removed. Review changes with: git diff");
  console.log("");
} else {
  console.log("  Keeping bundled Demo/Admin reference surfaces.");
  console.log("  Run 'npm run setup -- --trim-reference' later to remove them.");
  console.log("");
}
