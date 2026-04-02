#!/usr/bin/env node

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const moduleName = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (!moduleName) {
  console.error("Usage: npm run new-module <module-name>");
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
const title = kebab
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const snake = kebab.replaceAll("-", "_");
const frontendOnly = flags.has("--frontend-only");

const root = process.cwd();
const routeDir = path.join(root, "app", "(workspace)", kebab);
const componentDir = path.join(root, "components", "features", kebab);
const serviceDir = path.join(root, "services", "api");
const queryDir = path.join(root, "services", "query");
const routePath = `/${kebab}`;
const apiRouteFile = path.join(root, "api", "routes", `${snake}.py`);

const routeFile = path.join(routeDir, "page.tsx");
const featureFile = path.join(componentDir, `${kebab}-overview.tsx`);
const serviceFile = path.join(serviceDir, `${kebab}.ts`);
const queryFile = path.join(queryDir, `${kebab}.ts`);

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function insertBeforeMarker(source, marker, snippet) {
  const markerPattern = new RegExp(`^(\\s*)${escapeRegExp(marker)}`, "m");
  const markerMatch = source.match(markerPattern);

  if (!markerMatch) {
    throw new Error(`Marker not found: ${marker}`);
  }

  const indent = markerMatch[1] ?? "";
  const snippetLines = snippet.split("\n");
  const nonEmptySnippetLines = snippetLines.filter((line) => line.trim().length > 0);
  const snippetBaseIndent = Math.min(
    ...nonEmptySnippetLines.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0)
  );
  const indentedSnippet = snippetLines
    .map((line) => {
      if (line.trim().length === 0) {
        return line;
      }

      return `${indent}${line.slice(snippetBaseIndent)}`;
    })
    .join("\n");

  return source.replace(`${indent}${marker}`, `${indentedSnippet}\n${indent}${marker}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function updateFile(relativePath, marker, snippet) {
  const absolutePath = path.join(root, relativePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const next = insertBeforeMarker(source, marker, snippet);
  await fs.writeFile(absolutePath, next, "utf8");
}

if ((await exists(routeDir)) || (await exists(componentDir))) {
  console.error(`Module '${kebab}' already exists.`);
  process.exit(1);
}

await fs.mkdir(routeDir, { recursive: true });
await fs.mkdir(componentDir, { recursive: true });

await fs.writeFile(
  routeFile,
  `import { ${pascal}Overview } from "@/components/features/${kebab}/${kebab}-overview";

export default function ${pascal}Page() {
  return <${pascal}Overview />;
}
`,
  "utf8"
);

await fs.writeFile(
  featureFile,
  `import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ${pascal}Overview() {
  return (
    <div className="grid grid-cols-1 gap-[var(--space-4)] md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="flex-col items-start gap-[var(--space-1)]">
          <CardTitle>${title}</CardTitle>
          <CardDescription>Stage 1 structural foundation for this module.</CardDescription>
        </CardHeader>
        <CardContent>
          <CardDescription>
            Replace this starter card with your first real summary surface before adding
            Stage 2 interactions or Stage 3 data views.
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}
`,
  "utf8"
);

await updateFile(
  "config/navigation.config.ts",
  "// [new-module:insert-navigation]",
  `  {
    label: "${title}",
    href: "${routePath}",
    module: "${camel}",
    icon: "dashboards",
    section: "main",
  },`
);

await updateFile(
  "config/release.config.ts",
  "// [new-module:module-key]",
  `  | "${camel}"`
);

await updateFile(
  "config/release.config.ts",
  "// [new-module:all-modules]",
  `  "${camel}",`
);

await updateFile(
  "config/release.config.ts",
  "// [new-module:route-prefix]",
  `  { prefix: "${routePath}", module: "${camel}" },`
);

await updateFile(
  "config/workspace-page.config.ts",
  "// [new-module:page-identity]",
  `  {
    href: "${routePath}",
    title: "${title}",
    subtitle: "${title} workspace module.",
  },`
);

await fs.writeFile(
  serviceFile,
  `import { requestJson } from "./client";

// --- Types ---

export type ${pascal}Item = {
  id: string;
  // Add fields here
};

// --- API calls ---

export function fetch${pascal}List(signal?: AbortSignal): Promise<${pascal}Item[]> {
  return requestJson<${pascal}Item[]>("/${kebab}", { signal });
}
`,
  "utf8"
);

await fs.writeFile(
  queryFile,
  `import { useQuery } from "@tanstack/react-query";
import { fetch${pascal}List } from "../api/${kebab}";

export const ${camel}Keys = {
  all: ["${camel}"] as const,
  list: () => [...${camel}Keys.all, "list"] as const,
};

export function use${pascal}List() {
  return useQuery({
    queryKey: ${camel}Keys.list(),
    queryFn: ({ signal }) => fetch${pascal}List(signal),
  });
}
`,
  "utf8"
);

// ---------------------------------------------------------------------------
// Backend: route stub + app.py registration
// ---------------------------------------------------------------------------
if (!frontendOnly) {
  await fs.writeFile(
    apiRouteFile,
    `"""
${title} API routes.

Generated by: npm run new-module ${kebab}
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import Base

# ---------------------------------------------------------------------------
# Model — move to api/db/models.py when it stabilises
# ---------------------------------------------------------------------------
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column


class ${pascal}(Base):
    """${title} domain model. Customise columns as needed."""

    __tablename__ = "${snake}"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<${pascal} id={self.id} name={self.name!r}>"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ${pascal}Create(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ${pascal}Response(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/${kebab}", tags=["${kebab}"])


@router.get("", response_model=list[${pascal}Response])
async def list_${snake}(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(${pascal}).order_by(${pascal}.created_at.desc(), ${pascal}.id.desc()))
    return result.scalars().all()


@router.post("", response_model=${pascal}Response, status_code=status.HTTP_201_CREATED)
async def create_${snake}(payload: ${pascal}Create, db: AsyncSession = Depends(get_db)):
    row = ${pascal}(name=payload.name.strip())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_${snake}(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(${pascal}).where(${pascal}.id == item_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="${title} not found")
    await db.delete(row)
    await db.commit()
`,
    "utf8",
  );

  // Register import and router in api/app.py
  await updateFile(
    "api/app.py",
    "# [new-module:import-router]",
    `from api.routes.${snake} import router as ${snake}_router`,
  );

  await updateFile(
    "api/app.py",
    "# [new-module:register-router]",
    `app.include_router(${snake}_router)`,
  );
}

// ---------------------------------------------------------------------------
// Post-scaffold verification
// ---------------------------------------------------------------------------
console.log("");
console.log(`Module '${kebab}' scaffolded:`);
console.log(`  ${path.relative(root, routeFile)}`);
console.log(`  ${path.relative(root, featureFile)}`);
console.log(`  ${path.relative(root, serviceFile)}`);
console.log(`  ${path.relative(root, queryFile)}`);
if (!frontendOnly) {
  console.log(`  ${path.relative(root, apiRouteFile)}`);
}
console.log("");
console.log("Updated:");
console.log("  config/navigation.config.ts");
console.log("  config/release.config.ts");
console.log("  config/workspace-page.config.ts");
if (!frontendOnly) {
  console.log("  api/app.py");
}
console.log("");

// Run typecheck to verify the scaffold is clean
console.log("Verifying scaffold...");
try {
  execSync("npx tsc --noEmit", { cwd: root, stdio: "pipe" });
  console.log("  ✔  TypeScript check passed.");
} catch {
  console.log("  ⚠  TypeScript check found issues — review and fix before continuing.");
}
console.log("");

console.log("Next steps:");
console.log("  1. Review the generated navigation label, icon, and page subtitle");
console.log("  2. Replace the Stage 1 placeholder with your real feature surface");
if (!frontendOnly) {
  console.log(`  3. Customise the model columns in api/routes/${snake}.py`);
  console.log(`  4. Generate a migration: npm run db:migrate "add ${snake} table"`);
  console.log("  5. Apply it: npm run db:upgrade");
} else {
  console.log(`  3. Update the generated types and API endpoint in services/api/${kebab}.ts`);
}
console.log("");
