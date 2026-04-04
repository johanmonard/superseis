# Dynamic Activities Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dynamic Activities system under Project where users can create named activities that appear as sidebar sub-items and render as two-panel split pages at `/project/activities/[slug]`.

**Architecture:** Activities are persisted via a new SQLAlchemy model + FastAPI CRUD router. The frontend fetches activities via TanStack Query hooks. The sidebar renders dynamic children under an "Activities" collapsible group (same pattern as Settings). Each activity page uses the existing `ProjectSettingsPage` split-pane layout via a Next.js dynamic `[slug]` route.

**Tech Stack:** SQLAlchemy 2.0 (async), FastAPI, Alembic, TanStack Query, Next.js dynamic routes, existing Dialog/Input/Button UI components.

---

### Task 1: Activity SQLAlchemy Model

**Files:**
- Modify: `api/db/models.py`

**Step 1: Add the Activity model**

Add below the existing `Item` model:

```python
class Activity(Base):
    """A named activity within a project."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Activity id={self.id} name={self.name!r} slug={self.slug!r}>"
```

All imports (`DateTime`, `Integer`, `String`, `func`, `Mapped`, `mapped_column`) are already present in the file.

**Step 2: Generate Alembic migration**

Run from `api/` directory:
```bash
cd api && alembic revision --autogenerate -m "add activities table"
```

**Step 3: Apply migration**

```bash
cd api && alembic upgrade head
```

**Step 4: Commit**

```bash
git add api/db/models.py api/alembic/versions/
git commit -m "feat: add Activity model and migration"
```

---

### Task 2: Activity FastAPI Router

**Files:**
- Create: `api/routes/activities.py`
- Modify: `api/app.py`

**Step 1: Create the activities router**

Create `api/routes/activities.py` following the exact pattern from `api/routes/items.py`:

```python
"""Activity CRUD routes."""

import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import Activity

router = APIRouter(prefix="/activities", tags=["activities"])


def slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    slug = name.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    return slug.strip("-")


class ActivityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ActivityResponse(BaseModel):
    id: int
    name: str
    slug: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ActivityResponse])
async def list_activities(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Activity).order_by(Activity.created_at.desc(), Activity.id.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(payload: ActivityCreate, db: AsyncSession = Depends(get_db)):
    name = payload.name.strip()
    slug = slugify(name)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Name produces an empty slug"
        )

    # Check for duplicate slug
    existing = await db.execute(select(Activity).where(Activity.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An activity with slug '{slug}' already exists",
        )

    activity = Activity(name=name, slug=slug)
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return activity


@router.get("/{slug}", response_model=ActivityResponse)
async def get_activity(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Activity).where(Activity.slug == slug))
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return activity


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Activity).where(Activity.slug == slug))
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    await db.delete(activity)
    await db.commit()
```

**Step 2: Register the router in `api/app.py`**

Add at the `[new-module:import-router]` marker:

```python
from api.routes.activities import router as activities_router
```

Add at the `[new-module:register-router]` marker:

```python
app.include_router(activities_router)
```

**Step 3: Verify the server starts**

```bash
cd api && uvicorn api.app:app --reload --port 8000 &
sleep 2 && curl -s http://localhost:8000/activities | python3 -m json.tool
kill %1
```

Expected: `[]` (empty list)

**Step 4: Commit**

```bash
git add api/routes/activities.py api/app.py
git commit -m "feat: add activities CRUD API router"
```

---

### Task 3: Frontend API Service + Query Hooks

**Files:**
- Create: `services/api/activities.ts`
- Create: `services/query/activities.ts`

**Step 1: Create the API service**

Create `services/api/activities.ts` following the pattern in `services/api/items.ts`:

```typescript
import { requestJson } from './client'

export type Activity = {
  id: number
  name: string
  slug: string
  created_at: string
}

export type ActivityCreate = {
  name: string
}

export function fetchActivities(signal?: AbortSignal): Promise<Activity[]> {
  return requestJson<Activity[]>('/activities', { signal })
}

export function fetchActivity(slug: string, signal?: AbortSignal): Promise<Activity> {
  return requestJson<Activity>(`/activities/${slug}`, { signal })
}

export function createActivity(payload: ActivityCreate): Promise<Activity> {
  return requestJson<Activity>('/activities', { method: 'POST', body: payload })
}

export function deleteActivity(slug: string): Promise<void> {
  return requestJson<void>(`/activities/${slug}`, { method: 'DELETE' })
}
```

**Step 2: Create the TanStack Query hooks**

Create `services/query/activities.ts` following the pattern in `services/query/items.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createActivity,
  deleteActivity,
  fetchActivities,
  fetchActivity,
} from '../api/activities'

export const activityKeys = {
  all: ['activities'] as const,
  list: () => [...activityKeys.all, 'list'] as const,
  detail: (slug: string) => [...activityKeys.all, 'detail', slug] as const,
}

export function useActivitiesList() {
  return useQuery({
    queryKey: activityKeys.list(),
    queryFn: ({ signal }) => fetchActivities(signal),
  })
}

export function useActivity(slug: string) {
  return useQuery({
    queryKey: activityKeys.detail(slug),
    queryFn: ({ signal }) => fetchActivity(slug, signal),
  })
}

export function useCreateActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.all }),
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.all }),
  })
}
```

**Step 3: Commit**

```bash
git add services/api/activities.ts services/query/activities.ts
git commit -m "feat: add activities API service and query hooks"
```

---

### Task 4: Create Activity Dialog Component

**Files:**
- Create: `components/features/activities/create-activity-dialog.tsx`

**Step 1: Create the dialog component**

Uses the existing `Dialog`, `Input`, `Button`, and `useToast` components. Follows the form pattern from `items-surface.tsx` (plain `useState`, no form library).

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCreateActivity } from "@/services/query/activities";

export function CreateActivityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const { toast } = useToast();
  const router = useRouter();
  const createMutation = useCreateActivity();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    createMutation.mutate(
      { name: trimmed },
      {
        onSuccess: (activity) => {
          toast(`"${activity.name}" created`, "success");
          setName("");
          onOpenChange(false);
          router.push(`/project/activities/${activity.slug}`);
        },
        onError: () => {
          toast("Failed to create activity", "error");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>New Activity</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <Field label="Activity name" htmlFor="activity-name">
          <Input
            id="activity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Field Ops"
            disabled={createMutation.isPending}
            autoFocus
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
```

**Step 2: Commit**

```bash
git add components/features/activities/create-activity-dialog.tsx
git commit -m "feat: add create-activity dialog component"
```

---

### Task 5: Activities List Page with "+ Activity" Button

**Files:**
- Modify: `app/(workspace)/project/activities/page.tsx`

**Step 1: Replace the placeholder with the activities list page**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateActivityDialog } from "@/components/features/activities/create-activity-dialog";
import { useActivitiesList } from "@/services/query/activities";

export default function ActivitiesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: activities, isLoading } = useActivitiesList();

  return (
    <div className="space-y-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Activities
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} className="mr-1" />
          Activity
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : !activities?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No activities yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-1">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                href={`/project/activities/${activity.slug}`}
                className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              >
                {activity.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateActivityDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add app/\(workspace\)/project/activities/page.tsx
git commit -m "feat: add activities list page with create button"
```

---

### Task 6: Dynamic Activity Page with Split Layout

**Files:**
- Create: `app/(workspace)/project/activities/[slug]/page.tsx`

**Step 1: Create the dynamic route page**

This is the first dynamic route in the app. It reuses `ProjectSettingsPage` for the two-panel split layout.

```tsx
"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { useActivity } from "@/services/query/activities";

export default function ActivityPage() {
  const params = useParams<{ slug: string }>();
  const { data: activity, isLoading, error } = useActivity(params.slug);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">Loading activity...</p>
    );
  }

  if (error || !activity) {
    return (
      <p className="text-sm text-[var(--color-status-danger)]">Activity not found.</p>
    );
  }

  return (
    <ProjectSettingsPage title={activity.name} panelTitle={activity.name}>
      <p className="text-sm text-[var(--color-text-muted)]">
        Configure {activity.name} parameters here.
      </p>
    </ProjectSettingsPage>
  );
}
```

**Step 2: Register the page identity in `config/workspace-page.config.ts`**

No change needed — the existing `getWorkspacePageIdentity` function already falls back to longest prefix match, so `/project/activities/field-ops` will match the `/project/activities` entry.

**Step 3: Commit**

```bash
git add app/\(workspace\)/project/activities/\[slug\]/page.tsx
git commit -m "feat: add dynamic activity page with split layout"
```

---

### Task 7: Dynamic Sidebar Children for Activities

**Files:**
- Modify: `config/navigation.config.ts` — make Activities a sub-parent (like Settings) instead of a leaf
- Create: `components/features/activities/activity-nav-children.tsx` — hook that returns dynamic children
- Modify: `components/layout/workspace-sidebar-nav.tsx` — inject dynamic children + "+" button

**Step 1: Update navigation config**

In `config/navigation.config.ts`, change the Activities entry from a leaf to a sub-parent with an empty `children` array. The sidebar will populate it dynamically.

```typescript
// Change this:
{ label: "Activities", href: "/project/activities", icon: "activity" },

// To this:
{
  label: "Activities",
  href: "/project/activities",
  icon: "activity",
  children: [],
},
```

The empty `children` array signals to the sidebar that this is a collapsible group. The sidebar component will merge in dynamic children from the API.

**Step 2: Create the activity nav hook**

Create `components/features/activities/use-activity-nav-children.ts`:

```typescript
import type { NavigationChildItem } from "@/config/navigation.config";
import { useActivitiesList } from "@/services/query/activities";

export function useActivityNavChildren(): NavigationChildItem[] {
  const { data: activities } = useActivitiesList();

  if (!activities?.length) return [];

  return activities.map((activity) => ({
    label: activity.name,
    href: `/project/activities/${activity.slug}`,
    icon: "activity" as const,
  }));
}
```

**Step 3: Wire dynamic children + "+" button into the sidebar**

In `components/layout/workspace-sidebar-nav.tsx`:

1. Import the hook and dialog:

```typescript
import { useActivityNavChildren } from "../features/activities/use-activity-nav-children";
import { CreateActivityDialog } from "../features/activities/create-activity-dialog";
```

2. Inside the `WorkspaceSidebarNav` component, add state and call the hook:

```typescript
const activityNavChildren = useActivityNavChildren();
const [createActivityOpen, setCreateActivityOpen] = React.useState(false);
```

3. In the `renderChildNavigationItems` callback, where it renders a sub-parent item (the `hasSubChildren` branch around line 178), add a special case for "Activities" to:
   - Merge `activityNavChildren` into its `children`
   - Render a small "+" button next to the label

Specifically, replace the sub-parent `<SidebarItem>` label rendering. After the `<span>{child.label}</span>`, if `child.label === "Activities"`, add a `+` button:

```tsx
<span className="flex items-center gap-[var(--space-2)]">
  {child.icon ? (
    <Icon
      icon={appIcons[child.icon]}
      size={14}
      className={
        hasActiveSubChild
          ? "text-[var(--color-accent)]"
          : "text-[var(--color-text-muted)]"
      }
    />
  ) : null}
  <span>{child.label}</span>
</span>
<span className="flex items-center gap-[var(--space-1)]">
  {child.label === "Activities" ? (
    <button
      type="button"
      aria-label="New activity"
      onClick={(e) => {
        e.stopPropagation();
        setCreateActivityOpen(true);
      }}
      className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
    >
      <Plus size={12} />
    </button>
  ) : null}
  <Icon
    icon={isSubExpanded ? appIcons.chevronDown : appIcons.chevronRight}
    size={12}
    className="text-[var(--color-text-muted)]"
  />
</span>
```

Import `Plus` from lucide-react at the top of the file.

4. Merge dynamic children: Before calling `renderChildNavigationItems`, compute the effective children for each sub-parent. The cleanest approach is to build the merged list at the point where `child.children` is used (line 218). Replace:

```tsx
{child.children.map((sub) => {
```

with:

```tsx
{(child.label === "Activities"
  ? [...(child.children ?? []), ...activityNavChildren]
  : child.children
).map((sub) => {
```

5. Render the dialog at the bottom of the component, before the closing `</>` of the TooltipProvider:

```tsx
<CreateActivityDialog open={createActivityOpen} onOpenChange={setCreateActivityOpen} />
```

**Step 4: Commit**

```bash
git add config/navigation.config.ts components/features/activities/use-activity-nav-children.ts components/layout/workspace-sidebar-nav.tsx
git commit -m "feat: dynamic activity children in sidebar with + button"
```

---

### Task 8: Backend Tests

**Files:**
- Create: `api/tests/test_activities.py`

**Step 1: Write the tests**

Follow the pattern in `api/tests/conftest.py` for the test client setup:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from api.app import app
from api.db.engine import get_db
from api.db.models import Base

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = "sqlite+aiosqlite://"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


async def _override_get_db():
    async with test_session_factory() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
async def _setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_activities_empty(client: AsyncClient):
    response = await client.get("/activities")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_activity(client: AsyncClient):
    response = await client.post("/activities", json={"name": "Field Ops"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Field Ops"
    assert data["slug"] == "field-ops"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_duplicate_slug(client: AsyncClient):
    await client.post("/activities", json={"name": "Field Ops"})
    response = await client.post("/activities", json={"name": "Field Ops"})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_get_activity_by_slug(client: AsyncClient):
    await client.post("/activities", json={"name": "Processing"})
    response = await client.get("/activities/processing")
    assert response.status_code == 200
    assert response.json()["name"] == "Processing"


@pytest.mark.asyncio
async def test_get_activity_not_found(client: AsyncClient):
    response = await client.get("/activities/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_activity(client: AsyncClient):
    await client.post("/activities", json={"name": "Temp"})
    response = await client.delete("/activities/temp")
    assert response.status_code == 204

    response = await client.get("/activities/temp")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_activities_returns_created(client: AsyncClient):
    await client.post("/activities", json={"name": "Alpha"})
    await client.post("/activities", json={"name": "Beta"})
    response = await client.get("/activities")
    assert response.status_code == 200
    names = [a["name"] for a in response.json()]
    assert "Alpha" in names
    assert "Beta" in names
```

**Step 2: Run the tests**

```bash
cd api && python -m pytest tests/test_activities.py -v
```

Expected: All 7 tests pass.

**Step 3: Commit**

```bash
git add api/tests/test_activities.py
git commit -m "test: add activity API tests"
```

---

### Task 9: Frontend Component Test

**Files:**
- Create: `tests/components/create-activity-dialog.test.tsx`

**Step 1: Write the test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock the query hooks
const mockMutate = vi.fn();
vi.mock("@/services/query/activities", () => ({
  useCreateActivity: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock toast
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { CreateActivityDialog } from "@/components/features/activities/create-activity-dialog";

describe("CreateActivityDialog", () => {
  it("renders when open", () => {
    render(<CreateActivityDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("New Activity")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<CreateActivityDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByText("New Activity")).not.toBeInTheDocument();
  });

  it("disables Create button when name is empty", () => {
    render(<CreateActivityDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("calls mutate when form is submitted", () => {
    render(<CreateActivityDialog open={true} onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("e.g. Field Ops");
    fireEvent.change(input, { target: { value: "Test Activity" } });
    fireEvent.click(screen.getByText("Create"));
    expect(mockMutate).toHaveBeenCalledWith(
      { name: "Test Activity" },
      expect.any(Object)
    );
  });
});
```

**Step 2: Run the tests**

```bash
npx vitest run tests/components/create-activity-dialog.test.tsx
```

Expected: All 4 tests pass.

**Step 3: Commit**

```bash
git add tests/components/create-activity-dialog.test.tsx
git commit -m "test: add create-activity dialog tests"
```

---

### Task 10: Verify End-to-End

**Step 1: Start backend and frontend**

```bash
cd api && uvicorn api.app:app --reload --port 8000 &
npm run dev &
```

**Step 2: Manual verification checklist**

- [ ] Navigate to `/project/activities` — see empty state with "+ Activity" button
- [ ] Click "+ Activity" button — dialog opens
- [ ] Enter "Field Ops" and click Create — redirects to `/project/activities/field-ops`
- [ ] Activity page shows two-panel split layout with "Field Ops" as panel title
- [ ] Sidebar shows "Field Ops" under Activities group
- [ ] Click "+" in sidebar next to Activities — same dialog opens
- [ ] Create "Processing" — new entry appears in sidebar
- [ ] Navigate between activities via sidebar

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete dynamic activities system"
```
