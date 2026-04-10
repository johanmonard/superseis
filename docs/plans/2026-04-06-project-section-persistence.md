# Project Section Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist all project form data (definition, terrain, layers, design, etc.) to the backend as JSON blobs per section per project, so user input survives page reloads and is ready to send to the program API.

**Architecture:** A single `project_sections` table stores one JSON row per (project_id, section) pair. Two endpoints — `GET` and `PUT` — handle load and save. A generic `useProjectSection(projectId, section)` React hook auto-loads on mount and exposes a `save` function. Each form component wires into this hook to persist its local state. The active project context is upgraded to store the project `id` (not just name) so we can reference it in API calls.

**Tech Stack:** FastAPI, SQLAlchemy async (JSON column), Alembic, pytest. Frontend: TanStack Query, React hooks.

---

## Task 1: Add ProjectSection database model

**Files:**
- Modify: `api/db/models.py`
- Test: `api/tests/test_models.py`

**Step 1: Write the failing test**

Add to `api/tests/test_models.py`:

```python
@pytest.mark.asyncio
async def test_create_project_section(db_session):
    from api.db.models import Company, Project, ProjectSection

    company = Company(name="Test Co", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    project = Project(name="Test Project", company_id=company.id)
    db_session.add(project)
    await db_session.commit()

    section = ProjectSection(
        project_id=project.id,
        section="definition",
        data={"client": "Acme", "country": "France"},
    )
    db_session.add(section)
    await db_session.commit()

    from sqlalchemy import select
    result = await db_session.execute(select(ProjectSection))
    saved = result.scalar_one()
    assert saved.section == "definition"
    assert saved.data["client"] == "Acme"
    assert saved.updated_at is not None


@pytest.mark.asyncio
async def test_project_section_unique_constraint(db_session):
    from api.db.models import Company, Project, ProjectSection
    from sqlalchemy.exc import IntegrityError

    company = Company(name="Test Co", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    project = Project(name="Test Project", company_id=company.id)
    db_session.add(project)
    await db_session.commit()

    s1 = ProjectSection(project_id=project.id, section="definition", data={"v": 1})
    db_session.add(s1)
    await db_session.commit()

    s2 = ProjectSection(project_id=project.id, section="definition", data={"v": 2})
    db_session.add(s2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
```

**Step 2: Run test to verify it fails**

Run: `cd /home/johan/Documents/github/superseis && python3 -m pytest api/tests/test_models.py::test_create_project_section -v`
Expected: FAIL — `ProjectSection` not found

**Step 3: Write the model**

Add to `api/db/models.py`, after the `Project` class:

```python
from sqlalchemy import JSON, UniqueConstraint

class ProjectSection(Base):
    """Stores one JSON blob per (project, section) pair."""

    __tablename__ = "project_sections"
    __table_args__ = (
        UniqueConstraint("project_id", "section", name="uq_project_section"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    section: Mapped[str] = mapped_column(String(100), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
```

Note: Import `JSON` and `UniqueConstraint` from sqlalchemy at the top of the file.

**Step 4: Run tests**

Run: `cd /home/johan/Documents/github/superseis && python3 -m pytest api/tests/test_models.py -v`
Expected: All pass

**Step 5: Commit**

```bash
git add api/db/models.py api/tests/test_models.py
git commit -m "feat(db): add ProjectSection model for JSON form data persistence"
```

---

## Task 2: Add project section API endpoints

**Files:**
- Create: `api/routes/project_sections.py`
- Modify: `api/app.py` (register router)
- Test: `api/tests/test_project_sections.py`

**Step 1: Write the failing tests**

Create `api/tests/test_project_sections.py`:

```python
import pytest
from api.db.models import Company, Project, User
from api.security import hash_password


async def _setup_user_with_project(db_session):
    """Create company, user, project. Return (user, project)."""
    company = Company(name="Test Co", is_active=True, max_users=10)
    db_session.add(company)
    await db_session.commit()

    user = User(
        email="dev@test.com",
        password_hash=hash_password("pw"),
        company_id=company.id,
        role="member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    project = Project(name="Seismic Survey", company_id=company.id)
    db_session.add(project)
    await db_session.commit()

    return user, project


async def _login(client, email="dev@test.com", password="pw"):
    resp = await client.post("/auth/login", json={"username": email, "password": password})
    return resp.cookies


@pytest.mark.asyncio
async def test_get_empty_section(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)

    resp = await client.get(f"/project/{project.id}/sections/definition", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json() == {"section": "definition", "data": {}, "updated_at": None}


@pytest.mark.asyncio
async def test_put_and_get_section(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)

    payload = {"client": "Acme", "country": "France", "epsg": "32631"}
    resp = await client.put(
        f"/project/{project.id}/sections/definition",
        json=payload,
        cookies=cookies,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["section"] == "definition"
    assert data["data"]["client"] == "Acme"
    assert data["updated_at"] is not None

    # GET it back
    resp2 = await client.get(f"/project/{project.id}/sections/definition", cookies=cookies)
    assert resp2.json()["data"]["client"] == "Acme"


@pytest.mark.asyncio
async def test_put_overwrites_existing(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)

    await client.put(
        f"/project/{project.id}/sections/terrain",
        json={"groups": [{"name": "A"}]},
        cookies=cookies,
    )
    await client.put(
        f"/project/{project.id}/sections/terrain",
        json={"groups": [{"name": "B"}]},
        cookies=cookies,
    )

    resp = await client.get(f"/project/{project.id}/sections/terrain", cookies=cookies)
    assert resp.json()["data"]["groups"][0]["name"] == "B"


@pytest.mark.asyncio
async def test_cannot_access_other_company_project(client, db_session):
    """Tenant isolation: user from company B cannot read company A's project sections."""
    company_a = Company(name="A Corp", is_active=True, max_users=10)
    company_b = Company(name="B Corp", is_active=True, max_users=10)
    db_session.add_all([company_a, company_b])
    await db_session.commit()

    user_b = User(email="b@b.com", password_hash=hash_password("pw"), company_id=company_b.id, role="member", is_active=True)
    db_session.add(user_b)
    await db_session.commit()

    project_a = Project(name="A's Project", company_id=company_a.id)
    db_session.add(project_a)
    await db_session.commit()

    cookies_b = await _login(client, "b@b.com", "pw")

    resp = await client.get(f"/project/{project_a.id}/sections/definition", cookies=cookies_b)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_all_sections(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)

    await client.put(f"/project/{project.id}/sections/definition", json={"client": "X"}, cookies=cookies)
    await client.put(f"/project/{project.id}/sections/terrain", json={"groups": []}, cookies=cookies)

    resp = await client.get(f"/project/{project.id}/sections", cookies=cookies)
    assert resp.status_code == 200
    sections = {s["section"] for s in resp.json()}
    assert "definition" in sections
    assert "terrain" in sections


@pytest.mark.asyncio
async def test_invalid_section_name_rejected(client, db_session):
    _, project = await _setup_user_with_project(db_session)
    cookies = await _login(client)

    resp = await client.put(
        f"/project/{project.id}/sections/not_a_real_section",
        json={"foo": "bar"},
        cookies=cookies,
    )
    assert resp.status_code == 422
```

**Step 2: Run test to verify it fails**

Run: `cd /home/johan/Documents/github/superseis && python3 -m pytest api/tests/test_project_sections.py -v`
Expected: FAIL

**Step 3: Write the implementation**

Create `api/routes/project_sections.py`:

```python
"""Project section endpoints — save/load JSON form data per section."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import AuthPrincipal, get_current_user
from api.db.engine import get_db
from api.db.models import Project, ProjectSection

router = APIRouter(prefix="/project/{project_id}/sections", tags=["project-sections"])

# Allowed section names — reject anything not in this set.
VALID_SECTIONS = frozenset([
    "definition",
    "terrain",
    "osm",
    "layers",
    "maps",
    "design",
    "design_options",
    "partitioning",
    "offsetters",
    "crew",
])


def _validate_section(section: str) -> str:
    if section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid section '{section}'. Valid: {sorted(VALID_SECTIONS)}",
        )
    return section


async def _get_project_for_user(
    project_id: int,
    principal: AuthPrincipal,
    db: AsyncSession,
) -> Project:
    """Load project, enforcing tenant isolation."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.company_id == principal.company_id,
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class SectionResponse(BaseModel):
    section: str
    data: dict[str, Any]
    updated_at: datetime | None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[SectionResponse])
async def list_sections(
    project_id: int,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SectionResponse]:
    """List all saved sections for a project."""
    await _get_project_for_user(project_id, principal, db)

    result = await db.execute(
        select(ProjectSection)
        .where(ProjectSection.project_id == project_id)
        .order_by(ProjectSection.section)
    )
    return [SectionResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/{section}", response_model=SectionResponse)
async def get_section(
    project_id: int,
    section: str,
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SectionResponse:
    """Load a single section's data. Returns empty data if not yet saved."""
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)

    result = await db.execute(
        select(ProjectSection).where(
            ProjectSection.project_id == project_id,
            ProjectSection.section == section,
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        return SectionResponse(section=section, data={}, updated_at=None)

    return SectionResponse.model_validate(row)


@router.put("/{section}", response_model=SectionResponse)
async def put_section(
    project_id: int,
    section: str,
    body: dict[str, Any],
    principal: AuthPrincipal = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SectionResponse:
    """Create or overwrite a section's data."""
    _validate_section(section)
    await _get_project_for_user(project_id, principal, db)

    result = await db.execute(
        select(ProjectSection).where(
            ProjectSection.project_id == project_id,
            ProjectSection.section == section,
        )
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = ProjectSection(project_id=project_id, section=section, data=body)
        db.add(row)
    else:
        row.data = body

    await db.commit()
    await db.refresh(row)
    return SectionResponse.model_validate(row)
```

**Step 4: Register the router in `api/app.py`**

Add alongside existing imports:
```python
from api.routes.project_sections import router as project_sections_router
```

And register:
```python
app.include_router(project_sections_router)
```

**Step 5: Run tests**

Run: `cd /home/johan/Documents/github/superseis && python3 -m pytest api/tests/test_project_sections.py -v`
Expected: All 6 pass

Run full suite: `cd /home/johan/Documents/github/superseis && python3 -m pytest -v`
Expected: All pass

**Step 6: Commit**

```bash
git add api/routes/project_sections.py api/app.py api/tests/test_project_sections.py
git commit -m "feat(api): add project section endpoints for JSON form data persistence"
```

---

## Task 3: Add Alembic migration for project_sections table

**Files:**
- Create: `api/alembic/versions/<auto>_add_project_sections.py`

**Step 1: Generate migration**

Run: `cd /home/johan/Documents/github/superseis && PYTHONPATH=. python3 -m alembic -c api/alembic.ini revision --autogenerate -m "add project_sections table"`

**Step 2: Review the generated file**

Verify it creates `project_sections` table with columns: id, project_id (FK), section, data (JSON), updated_at, and the unique constraint.

**Step 3: Apply migration**

Run: `cd /home/johan/Documents/github/superseis && PYTHONPATH=. python3 -m alembic -c api/alembic.ini upgrade head`

**Step 4: Commit**

```bash
git add api/alembic/versions/
git commit -m "feat(db): add migration for project_sections table"
```

---

## Task 4: Frontend API service and query hook for project sections

**Files:**
- Create: `services/api/project-sections.ts`
- Create: `services/query/project-sections.ts`

**Step 1: Create the API service**

Create `services/api/project-sections.ts`:

```typescript
import { requestJson } from "./client";

export interface ProjectSectionData {
  section: string;
  data: Record<string, unknown>;
  updated_at: string | null;
}

export function fetchProjectSection(
  projectId: number,
  section: string,
  signal?: AbortSignal,
): Promise<ProjectSectionData> {
  return requestJson<ProjectSectionData>(
    `/project/${projectId}/sections/${section}`,
    { signal },
  );
}

export function saveProjectSection(
  projectId: number,
  section: string,
  data: Record<string, unknown>,
): Promise<ProjectSectionData> {
  return requestJson<ProjectSectionData>(
    `/project/${projectId}/sections/${section}`,
    { method: "PUT", body: data },
  );
}

export function fetchAllProjectSections(
  projectId: number,
  signal?: AbortSignal,
): Promise<ProjectSectionData[]> {
  return requestJson<ProjectSectionData[]>(
    `/project/${projectId}/sections`,
    { signal },
  );
}
```

**Step 2: Create the query hook**

Create `services/query/project-sections.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchProjectSection,
  saveProjectSection,
  type ProjectSectionData,
} from "../api/project-sections";

export const sectionKeys = {
  all: ["project-sections"] as const,
  project: (projectId: number) =>
    [...sectionKeys.all, projectId] as const,
  detail: (projectId: number, section: string) =>
    [...sectionKeys.project(projectId), section] as const,
};

export function useProjectSection(projectId: number | null, section: string) {
  return useQuery({
    queryKey: sectionKeys.detail(projectId ?? 0, section),
    queryFn: ({ signal }) => fetchProjectSection(projectId!, section, signal),
    enabled: projectId !== null && projectId > 0,
  });
}

export function useSaveProjectSection(projectId: number | null, section: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      saveProjectSection(projectId!, section, data),
    onSuccess: (saved) => {
      qc.setQueryData<ProjectSectionData>(
        sectionKeys.detail(projectId ?? 0, section),
        saved,
      );
    },
  });
}
```

**Step 3: Verify frontend compiles**

Run: `cd /home/johan/Documents/github/superseis && NEXT_PUBLIC_AUTH_PROVIDER=custom npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add services/api/project-sections.ts services/query/project-sections.ts
git commit -m "feat(frontend): add project section API service and query hooks"
```

---

## Task 5: Upgrade ActiveProjectContext to store project ID

Currently `useActiveProject()` stores just the project name as a string. We need the project `id` for API calls.

**Files:**
- Modify: `lib/use-active-project.tsx`
- Modify: any components that read `activeProject` (they use `activeProject` as a string — update to use `activeProject.name`)

**Step 1: Update the context**

Rewrite `lib/use-active-project.tsx`:

```typescript
"use client";

import * as React from "react";

export interface ActiveProject {
  id: number;
  name: string;
}

interface ActiveProjectContextValue {
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
}

const ActiveProjectContext = React.createContext<ActiveProjectContextValue>({
  activeProject: null,
  setActiveProject: () => {},
});

export function ActiveProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeProject, setActiveProject] =
    React.useState<ActiveProject | null>(null);

  const value = React.useMemo(
    () => ({ activeProject, setActiveProject }),
    [activeProject],
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject() {
  return React.useContext(ActiveProjectContext);
}
```

**Step 2: Find and update all consumers**

Search for `useActiveProject` and `activeProject` across the frontend. Every place that reads `activeProject` as a string must be updated to read `activeProject?.name` or `activeProject?.id`. Common locations:
- `components/features/project/project-definition.tsx` — uses `activeProject` as project name display
- `components/features/home/` — project selection/creation
- Any component that calls `setActiveProject("name")` must change to `setActiveProject({ id, name })`

For `setActiveProject` calls: wherever a project is selected from the project list API, the response already contains `id` and `name`, so pass `{ id: project.id, name: project.name }`.

**Step 3: Verify frontend compiles**

Run: `cd /home/johan/Documents/github/superseis && NEXT_PUBLIC_AUTH_PROVIDER=custom npx next build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add lib/use-active-project.tsx components/ 
git commit -m "feat: upgrade ActiveProjectContext to store project id and name"
```

---

## Task 6: Wire up project-definition form to persist via API

This task demonstrates the pattern for connecting a form to the backend. The same pattern applies to all other sections.

**Files:**
- Modify: `components/features/project/project-definition.tsx`

**Step 1: Add load and save to the definition component**

At the top of the component, add:

```typescript
import { useProjectSection, useSaveProjectSection } from "@/services/query/project-sections";
import { useActiveProject } from "@/lib/use-active-project";
```

Inside the component:
1. Get `activeProject` from `useActiveProject()`
2. Call `useProjectSection(activeProject?.id ?? null, "definition")` to load saved data
3. On mount / when data loads, populate the form state from `data.data`
4. Add a "Save" button (or auto-save on blur/change) that calls `useSaveProjectSection(activeProject?.id ?? null, "definition").mutate(formState)`

The exact wiring depends on how the component manages state (local useState vs DefinitionFormContext). Read the component to determine the right approach.

**Key pattern:**
```typescript
const { activeProject } = useActiveProject();
const projectId = activeProject?.id ?? null;
const { data: saved } = useProjectSection(projectId, "definition");
const saveMutation = useSaveProjectSection(projectId, "definition");

// Load saved data into form state on mount
React.useEffect(() => {
  if (saved?.data && Object.keys(saved.data).length > 0) {
    // populate form fields from saved.data
  }
}, [saved]);

// Save handler
const handleSave = () => {
  saveMutation.mutate({ client, country, epsg, second, region, crsName, ... });
};
```

**Step 2: Add a Save button to the form**

Place a save button in the form header or footer area.

**Step 3: Test manually**

1. Start the app
2. Log in, select/create a project
3. Fill in definition fields
4. Click Save
5. Refresh the page — data should reload from the API

**Step 4: Commit**

```bash
git add components/features/project/project-definition.tsx
git commit -m "feat: persist project definition form data to backend"
```

---

## Task 7-15: Wire up remaining sections (same pattern)

Each remaining section follows the exact same pattern as Task 6. For each:

1. Import `useProjectSection` and `useSaveProjectSection`
2. Load saved data on mount
3. Add save functionality
4. Test manually

**Sections to wire up:**

| Task | Section name | Component file | Notes |
|------|-------------|----------------|-------|
| 7 | `terrain` | `project-terrain.tsx` | Complex nested state (TerrainGroup[]) |
| 8 | `layers` | `project-layers.tsx` | LayerConfig[] |
| 9 | `maps` | `project-maps.tsx` | MapConfig[] |
| 10 | `design` | `project-design.tsx` | DesignGroup[] |
| 11 | `design_options` | `project-design-options.tsx` | DesignOption[] |
| 12 | `partitioning` | `project-partitioning.tsx` | RegionGroup[] |
| 13 | `offsetters` | `project-offsetters.tsx` | OffsetterConfig[] |
| 14 | `crew` | `project-crew.tsx` | CrewOption[] |
| 15 | `osm` | `project-osm.tsx` | Download config only |

**Note on Activities and Resources:** These are dynamic entities (created/deleted from sidebar) with their own slug-based routes. They should be added to `VALID_SECTIONS` as `activity_{slug}` and `resource_{slug}` patterns, OR stored via a separate mechanism. Decide this when wiring them up — for now, the 10 static sections above cover the core project configuration.

Each commit message: `feat: persist project {section} form data to backend`

---

## Summary

After implementation:
- All project form data persists to the backend as JSON
- Each section loads/saves independently (no mega-payload)
- Tenant isolation ensures companies can't see each other's data
- The `useProjectSection` / `useSaveProjectSection` hooks provide a clean, reusable pattern
- Adding new sections = add to `VALID_SECTIONS` + wire up the component
- Future templates feature = copy a section's JSON to a `section_templates` table (no structural changes needed)
