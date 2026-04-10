"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;

import { CoordinateInput } from "@/components/ui/coordinate-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData, AutosaveStatus } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface ExtentTab {
  id: string;
  name: string;
  marginTop: string;
  marginLeft: string;
  marginRight: string;
  marginBottom: string;
  gridOriginX: string;
  gridOriginY: string;
  rlAngle: string;
  resolution: string;
}

interface TerrainGroup {
  id: string;
  name: string;
  acquisitionPolygon: string;
  pois: string[];
  extents: ExtentTab[];
  activeExtentId: string;
}

const DUMMY_POLYGONS = [
  "exclusion_zone_north",
  "survey_boundary_v2",
  "river_buffer_500m",
  "protected_area_east",
  "camp_exclusion",
];

const DUMMY_POIS = [
  "well_locations",
  "camp_sites",
  "access_roads",
  "river_crossings",
  "villages",
];

function createExtent(name: string): ExtentTab {
  return {
    id: crypto.randomUUID(),
    name,
    marginTop: "1000",
    marginLeft: "1000",
    marginRight: "1000",
    marginBottom: "1000",
    gridOriginX: "0",
    gridOriginY: "0",
    rlAngle: "0",
    resolution: "",
  };
}

function createGroup(name: string): TerrainGroup {
  const offsets = createExtent("Offsets");
  const video = createExtent("Video");
  const gisdata = createExtent("GISDATA");
  return {
    id: crypto.randomUUID(),
    name,
    acquisitionPolygon: "",
    pois: [],
    extents: [offsets, video, gisdata],
    activeExtentId: offsets.id,
  };
}

interface TerrainData {
  groups: TerrainGroup[];
  activeGroupId: string;
}

const DEFAULT_TERRAIN: TerrainData = {
  groups: [createGroup("Terrain Option 1")],
  activeGroupId: "",
};

/* ------------------------------------------------------------------
   Group selector (reusable pattern)
   ------------------------------------------------------------------ */

function GroupSelector({
  groups,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  groups: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {groups.map((g) => {
          if (g.id === editingId) {
            return (
              <div
                key={g.id}
                className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
              >
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 w-28 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
                />
                <button type="button" onClick={commitEdit} className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]">
                  <Check size={10} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]">
                  <X size={10} />
                </button>
              </div>
            );
          }
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className={cn(
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                g.id === activeId
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {g.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = groups.find((g) => g.id === activeId);
            if (active) { setEditingId(active.id); setEditValue(active.name); }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {groups.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Tag list with dropdown to add
   ------------------------------------------------------------------ */

function TagList({
  selected,
  available,
  onAdd,
  onRemove,
}: {
  selected: string[];
  available: string[];
  onAdd: (v: string) => void;
  onRemove: (index: number) => void;
}) {
  const unselected = available.filter((p) => !selected.includes(p));

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-[var(--space-1)]">
          {selected.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-secondary)]"
            >
              {name}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {unselected.length > 0 && (
        <Select
          value=""
          onChange={(e) => { if (e.target.value) onAdd(e.target.value); }}
        >
          <option value="">Add POI…</option>
          {unselected.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Margin box — visual representation
   ------------------------------------------------------------------ */

function MarginBox({
  top, left, right, bottom,
  onTopChange, onLeftChange, onRightChange, onBottomChange,
}: {
  top: string; left: string; right: string; bottom: string;
  onTopChange: (v: string) => void;
  onLeftChange: (v: string) => void;
  onRightChange: (v: string) => void;
  onBottomChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      {/* Top */}
      <div className="flex justify-center">
        <Input
          type="number"
          value={top}
          onChange={(e) => onTopChange(e.target.value)}
          className="w-20 text-center"
          aria-label="Margin top"
        />
      </div>
      {/* Middle row: Left — box — Right */}
      <div className="flex items-center gap-[var(--space-1)]">
        <Input
          type="number"
          value={left}
          onChange={(e) => onLeftChange(e.target.value)}
          className="flex-1 text-center"
          aria-label="Margin left"
        />
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] text-[10px] text-[var(--color-text-muted)]">
          extent
        </div>
        <Input
          type="number"
          value={right}
          onChange={(e) => onRightChange(e.target.value)}
          className="flex-1 text-center"
          aria-label="Margin right"
        />
      </div>
      {/* Bottom */}
      <div className="flex justify-center">
        <Input
          type="number"
          value={bottom}
          onChange={(e) => onBottomChange(e.target.value)}
          className="w-20 text-center"
          aria-label="Margin bottom"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Extent tabs (secondary style)
   ------------------------------------------------------------------ */

function ExtentTabs({
  items,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  items: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {items.map((item) => {
          if (item.id === editingId) {
            return (
              <div
                key={item.id}
                className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
              >
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 w-20 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
                />
                <button type="button" onClick={commitEdit} className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]">
                  <Check size={10} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]">
                  <X size={10} />
                </button>
              </div>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                item.id === activeId
                  ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {item.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add extent"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = items.find((i) => i.id === activeId);
            if (active) { setEditingId(active.id); setEditValue(active.name); }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function ProjectTerrain() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update, status } = useSectionData<TerrainData>(projectId, "terrain", DEFAULT_TERRAIN);
  const groups = data.groups;
  const activeGroupId = data.activeGroupId || groups[0]?.id || "";

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const activeExtent =
    activeGroup.extents.find((e) => e.id === activeGroup.activeExtentId) ??
    activeGroup.extents[0];

  const updateGroup = React.useCallback(
    (id: string, patch: Partial<TerrainGroup>) => {
      update({ ...data, groups: data.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
    },
    [data, update]
  );

  const addGroup = React.useCallback(() => {
    const g = createGroup(`Terrain Option ${groups.length + 1}`);
    update({ groups: [...data.groups, g], activeGroupId: g.id });
  }, [data, groups.length, update]);

  const deleteGroup = React.useCallback(
    (id: string) => {
      const next = data.groups.filter((g) => g.id !== id);
      const newActiveId = activeGroupId === id && next.length > 0 ? next[0].id : activeGroupId;
      update({ groups: next, activeGroupId: newActiveId });
    },
    [data, activeGroupId, update]
  );

  const updateExtent = React.useCallback(
    (extentId: string, patch: Partial<ExtentTab>) => {
      update({
        ...data,
        groups: data.groups.map((g) => {
          if (g.id !== activeGroupId) return g;
          return {
            ...g,
            extents: g.extents.map((e) => (e.id === extentId ? { ...e, ...patch } : e)),
          };
        }),
      });
    },
    [data, activeGroupId, update]
  );

  const addExtent = React.useCallback(() => {
    const ext = createExtent(`Extent ${activeGroup.extents.length + 1}`);
    update({
      ...data,
      groups: data.groups.map((g) =>
        g.id === activeGroupId
          ? { ...g, extents: [...g.extents, ext], activeExtentId: ext.id }
          : g
      ),
    });
  }, [data, activeGroup, activeGroupId, update]);

  const deleteExtent = React.useCallback(
    (extentId: string) => {
      const nextExtents = activeGroup.extents.filter((e) => e.id !== extentId);
      const newActiveExtentId =
        activeGroup.activeExtentId === extentId && nextExtents.length > 0
          ? nextExtents[0].id
          : activeGroup.activeExtentId;
      update({
        ...data,
        groups: data.groups.map((g) =>
          g.id === activeGroupId
            ? { ...g, extents: nextExtents, activeExtentId: newActiveExtentId }
            : g
        ),
      });
    },
    [data, activeGroup, activeGroupId, update]
  );

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Autosave status */}
      <div className="flex justify-end">
        <AutosaveStatus status={status} />
      </div>

      {/* Group selector */}
      <GroupSelector
        groups={groups}
        activeId={activeGroupId}
        onSelect={(id) => update({ ...data, activeGroupId: id })}
        onAdd={addGroup}
        onRename={(id, name) => updateGroup(id, { name })}
        onDelete={deleteGroup}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Features */}
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Features
      </span>

      <Field label="Acq. Polygon" layout="horizontal">
        <Select
          value={activeGroup.acquisitionPolygon}
          onChange={(e) => updateGroup(activeGroupId, { acquisitionPolygon: e.target.value })}
        >
          <option value="">None</option>
          {DUMMY_POLYGONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </Field>

      <Field label="Points of Interest" layout="horizontal">
        <TagList
          selected={activeGroup.pois}
          available={DUMMY_POIS}
          onAdd={(v) => updateGroup(activeGroupId, { pois: [...activeGroup.pois, v] })}
          onRemove={(i) =>
            updateGroup(activeGroupId, {
              pois: activeGroup.pois.filter((_, idx) => idx !== i),
            })
          }
        />
      </Field>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Extents Definition */}
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Extents Definition
      </span>

      <ExtentTabs
        items={activeGroup.extents}
        activeId={activeGroup.activeExtentId}
        onSelect={(id) => updateGroup(activeGroupId, { activeExtentId: id })}
        onAdd={addExtent}
        onRename={(id, name) => updateExtent(id, { name })}
        onDelete={deleteExtent}
      />

      {/* Extent fields — labels on top */}
      <Field label="Margins">
        <MarginBox
          top={activeExtent.marginTop}
          left={activeExtent.marginLeft}
          right={activeExtent.marginRight}
          bottom={activeExtent.marginBottom}
          onTopChange={(v) => updateExtent(activeExtent.id, { marginTop: v })}
          onLeftChange={(v) => updateExtent(activeExtent.id, { marginLeft: v })}
          onRightChange={(v) => updateExtent(activeExtent.id, { marginRight: v })}
          onBottomChange={(v) => updateExtent(activeExtent.id, { marginBottom: v })}
        />
      </Field>

      <div className="grid grid-cols-3 gap-[var(--space-3)]">
        <Field label="Grid Origin" htmlFor="ter-grid-origin">
          <CoordinateInput
            align="left"
            x={activeExtent.gridOriginX}
            y={activeExtent.gridOriginY}
            onXChange={(v) => updateExtent(activeExtent.id, { gridOriginX: v })}
            onYChange={(v) => updateExtent(activeExtent.id, { gridOriginY: v })}
          />
        </Field>

        <Field label="RL Angle" htmlFor="ter-rl-angle">
          <Input
            id="ter-rl-angle"
            type="number"
            value={activeExtent.rlAngle}
            onChange={(e) => updateExtent(activeExtent.id, { rlAngle: e.target.value })}
          />
        </Field>

        <Field label="Resolution" htmlFor="ter-resolution">
          <Input
            id="ter-resolution"
            type="number"
            value={activeExtent.resolution}
            onChange={(e) => updateExtent(activeExtent.id, { resolution: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}
