#!/usr/bin/env node

/**
 * Remove a module previously created by new-module.mjs.
 *
 * Run via: npm run remove-module <module-name>
 *
 * Only removes files and config entries it can positively identify as
 * generated.  Manual additions inside those files are NOT preserved —
 * review the diff before committing.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const moduleName = process.argv[2];

if (!moduleName) {
  console.error("Usage: npm run remove-module <module-name>");
  process.exit(1);
}

const kebab = moduleName.trim().toLowerCase();

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(kebab)) {
  console.error("Module names must use kebab-case, for example: work-orders");
  process.exit(1);
}

const pascal = kebab
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");
const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
const snake = kebab.replaceAll("-", "_");
const routePath = `/${kebab}`;

const root = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(targetPath) {
  if (await exists(targetPath)) {
    await fs.rm(targetPath, { recursive: true, force: true });
    console.log(`  ✔  Removed ${path.relative(root, targetPath)}`);
    return true;
  }
  return false;
}

/**
 * Remove lines from a file that match a predicate.  Returns true if the
 * file was modified.
 */
async function removeMatchingLines(relativePath, predicate) {
  const absolutePath = path.join(root, relativePath);
  if (!(await exists(absolutePath))) return false;

  const source = await fs.readFile(absolutePath, "utf8");
  const lines = source.split("\n");
  const filtered = lines.filter((line) => !predicate(line));

  if (filtered.length === lines.length) return false;

  await fs.writeFile(absolutePath, filtered.join("\n"), "utf8");
  return true;
}

/**
 * Remove a multi-line block from a config file.  The block is identified
 * by an opening line that matches `startPredicate` and a closing `}` or
 * `},` line at the same or lesser indentation.
 */
async function removeConfigBlock(relativePath, startPredicate) {
  const absolutePath = path.join(root, relativePath);
  if (!(await exists(absolutePath))) return false;

  const source = await fs.readFile(absolutePath, "utf8");
  const lines = source.split("\n");
  const result = [];
  let skipping = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!skipping && startPredicate(lines[i])) {
      skipping = true;
      blockIndent = lines[i].search(/\S/);
      // If the start line also closes (single-line entry), skip just this line
      if (/\},?\s*$/.test(lines[i]) && /{/.test(lines[i])) {
        skipping = false;
        continue;
      }
      continue;
    }

    if (skipping) {
      const trimmed = lines[i].trim();
      // End of block: closing brace at block indent level
      if (/^\},?\s*$/.test(trimmed)) {
        const currentIndent = lines[i].search(/\S/);
        if (currentIndent <= blockIndent) {
          skipping = false;
          continue;
        }
      }
      continue;
    }

    result.push(lines[i]);
  }

  if (result.length === lines.length) return false;

  await fs.writeFile(absolutePath, result.join("\n"), "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

const routeDir = path.join(root, "app", "(workspace)", kebab);
const componentDir = path.join(root, "components", "features", kebab);

if (!(await exists(routeDir)) && !(await exists(componentDir))) {
  console.error(`Module '${kebab}' does not exist. Nothing to remove.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Remove generated files
// ---------------------------------------------------------------------------
console.log("");
console.log(`Removing module '${kebab}'...`);
console.log("");

await removeIfExists(routeDir);
await removeIfExists(componentDir);
await removeIfExists(path.join(root, "services", "api", `${kebab}.ts`));
await removeIfExists(path.join(root, "services", "query", `${kebab}.ts`));
await removeIfExists(path.join(root, "api", "routes", `${snake}.py`));

// ---------------------------------------------------------------------------
// Clean up config entries
// ---------------------------------------------------------------------------
console.log("");
console.log("Cleaning config entries...");

// navigation.config.ts — remove the block containing this module
const navChanged = await removeConfigBlock(
  "config/navigation.config.ts",
  (line) => line.includes(`module: "${camel}"`) || line.includes(`href: "${routePath}"`),
);
if (navChanged) console.log("  ✔  config/navigation.config.ts");

// release.config.ts — remove type union member, enabled set entry, route prefix
const releaseFile = "config/release.config.ts";
let releaseChanged = false;

releaseChanged = (await removeMatchingLines(releaseFile, (line) =>
  line.trim() === `| "${camel}"`
)) || releaseChanged;

releaseChanged = (await removeMatchingLines(releaseFile, (line) =>
  line.trim() === `"${camel}",`
)) || releaseChanged;

releaseChanged = (await removeConfigBlock(releaseFile, (line) =>
  line.includes(`prefix: "${routePath}"`) && line.includes(`module: "${camel}"`)
)) || releaseChanged;

if (releaseChanged) console.log("  ✔  config/release.config.ts");

// workspace-page.config.ts — remove the page identity block
const pageChanged = await removeConfigBlock(
  "config/workspace-page.config.ts",
  (line) => line.includes(`href: "${routePath}"`) && !line.includes("//"),
);
if (pageChanged) console.log("  ✔  config/workspace-page.config.ts");

// api/app.py — remove import and include_router lines
const appPyPath = "api/app.py";
let appPyChanged = false;

appPyChanged = (await removeMatchingLines(appPyPath, (line) =>
  line.trim() === `from api.routes.${snake} import router as ${snake}_router`
)) || appPyChanged;

appPyChanged = (await removeMatchingLines(appPyPath, (line) =>
  line.trim() === `app.include_router(${snake}_router)`
)) || appPyChanged;

if (appPyChanged) console.log("  ✔  api/app.py");

console.log("");
console.log(`Module '${kebab}' removed.`);
console.log("");
console.log("Review the changes before committing:");
console.log("  git diff");
console.log("");
