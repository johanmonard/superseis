import { join } from "node:path";
import { asyncBufferFromFile, parquetMetadataAsync, parquetSchema, parquetRead } from "hyparquet";
import type { FileMetaData, RowGroup } from "hyparquet";

const PARQUET_DIR = join(process.cwd(), "share", "parquet");

function safePath(filename: string): string | null {
  if (filename.includes("..") || !filename.endsWith(".parquet")) return null;
  return join(PARQUET_DIR, filename);
}

// ---------------------------------------------------------------------------
// GET /api/parquet/[filename]?uniques=day,wtype,type
// Returns schema info: field names, types, total row count, and optionally
// the sorted unique values for the requested columns.
// ---------------------------------------------------------------------------
export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filePath = safePath(filename);
  if (!filePath) return new Response("Bad filename", { status: 400 });

  try {
    const file = await asyncBufferFromFile(filePath);
    const metadata: FileMetaData = await parquetMetadataAsync(file);
    const tree = parquetSchema(metadata);

    const fields = tree.children.map((child) => ({
      name: child.element.name,
      type: child.element.type ?? child.element.converted_type ?? "UNKNOWN",
      logicalType: child.element.logical_type ?? null,
    }));

    // Optionally compute unique values for requested columns
    const url = new URL(req.url);
    const uniquesParam = url.searchParams.get("uniques");
    let uniques: Record<string, (string | number)[]> | undefined;

    if (uniquesParam) {
      const cols = uniquesParam.split(",").filter(Boolean);
      const sets = new Map<string, Set<string | number>>();
      for (const col of cols) sets.set(col, new Set());

      // onComplete receives row-oriented data: rows[rowIdx][colIdx]
      await parquetRead({
        file,
        columns: cols,
        onComplete(rows) {
          if (!rows || rows.length === 0) return;
          for (const row of rows as unknown[][]) {
            cols.forEach((col, colIdx) => {
              const v = row[colIdx];
              if (v != null) {
                sets.get(col)!.add(
                  typeof v === "bigint" ? Number(v) : (v as string | number)
                );
              }
            });
          }
        },
      });

      uniques = {};
      for (const [col, s] of sets) {
        const arr = Array.from(s);
        arr.sort((a, b) => {
          if (typeof a === "number" && typeof b === "number") return a - b;
          return String(a).localeCompare(String(b));
        });
        uniques[col] = arr;
      }
    }

    return Response.json({
      fields,
      numRows: Number(metadata.num_rows),
      ...(uniques ? { uniques } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/parquet/[filename]
// Body: { filters: Record<string, { op: string; value: string }> }
// Returns { count: number } — the number of rows matching all filters.
// ---------------------------------------------------------------------------

type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "startsWith" | "in";

interface FilterDef {
  op: FilterOp;
  value: string;
}

function matchesFilter(cellValue: unknown, filter: FilterDef): boolean {
  const { op, value } = filter;
  if (value === "") return true;
  if (cellValue == null) return false;

  const strCell = String(cellValue);

  if (op === "in") {
    const allowed = new Set(value.split(","));
    return allowed.has(strCell);
  }

  const numCell = typeof cellValue === "bigint" ? Number(cellValue) : Number(cellValue);
  const numFilter = Number(value);
  const isNumeric = !isNaN(numCell) && !isNaN(numFilter) && value !== "";

  switch (op) {
    case "eq":
      return isNumeric ? numCell === numFilter : strCell === value;
    case "neq":
      return isNumeric ? numCell !== numFilter : strCell !== value;
    case "gt":
      return isNumeric ? numCell > numFilter : strCell > value;
    case "gte":
      return isNumeric ? numCell >= numFilter : strCell >= value;
    case "lt":
      return isNumeric ? numCell < numFilter : strCell < value;
    case "lte":
      return isNumeric ? numCell <= numFilter : strCell <= value;
    case "contains":
      return strCell.toLowerCase().includes(value.toLowerCase());
    case "startsWith":
      return strCell.toLowerCase().startsWith(value.toLowerCase());
    default:
      return true;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filePath = safePath(filename);
  if (!filePath) return new Response("Bad filename", { status: 400 });

  try {
    const body = (await req.json()) as {
      action?: "count" | "trajectories";
      filters?: Record<string, FilterDef>;
      timeCol?: string;
      entityCol?: string;
      groupCol?: string;
      lonCol?: string;
      latCol?: string;
    };
    const action = body.action ?? "count";
    const filters = body.filters ?? {};
    const activeFilters = Object.entries(filters).filter(
      ([, f]) => f.value !== ""
    );

    const file = await asyncBufferFromFile(filePath);

    if (action === "count" && activeFilters.length === 0) {
      const metadata = await parquetMetadataAsync(file);
      return Response.json({ count: Number(metadata.num_rows) });
    }

    const filterCols = activeFilters.map(([col]) => col);
    const timeCol = body.timeCol ?? "time";
    const entityCol = body.entityCol ?? "wid";
    const groupCol = body.groupCol ?? "";
    const lonCol = body.lonCol ?? "lon";
    const latCol = body.latCol ?? "lat";
    const needsTrajectories = action === "trajectories";

    const colSet = new Set(filterCols);
    if (needsTrajectories) {
      colSet.add(timeCol);
      colSet.add(entityCol);
      if (groupCol) colSet.add(groupCol);
      colSet.add(lonCol);
      colSet.add(latCol);
      colSet.add("event");
    }

    // Check if elevation column exists in the schema
    const metadata = await parquetMetadataAsync(file);
    const schemaNames = parquetSchema(metadata).children.map((c) => c.element.name);
    const hasElevation = schemaNames.includes("elevation");
    if (needsTrajectories && hasElevation) colSet.add("elevation");

    const columnsNeeded = Array.from(colSet);

    const colIdx = (name: string) => columnsNeeded.indexOf(name);
    const filtersByIdx = activeFilters.map(([col, def]) => ({
      idx: colIdx(col),
      def,
    }));
    const timeIdx = needsTrajectories ? colIdx(timeCol) : -1;
    const entityIdx = needsTrajectories ? colIdx(entityCol) : -1;
    const groupIdx = needsTrajectories && groupCol ? colIdx(groupCol) : -1;
    const lonIdx = needsTrajectories ? colIdx(lonCol) : -1;
    const latIdx = needsTrajectories ? colIdx(latCol) : -1;
    const eventIdx = needsTrajectories ? colIdx("event") : -1;
    const elevIdx = needsTrajectories && hasElevation ? colIdx("elevation") : -1;

    // positions/acqu tuples: [time, lon, lat, elevation]
    type Pos = [number, number, number, number];
    let count = 0;
    const trajMap = new Map<number | string, Pos[]>();
    const acquMap = new Map<number | string, Pos[]>();

    const processRows = (rows: unknown[][] | undefined) => {
      if (!rows || rows.length === 0) return;
      for (const row of rows) {
        let pass = true;
        for (const { idx, def } of filtersByIdx) {
          if (!matchesFilter(row[idx], def)) {
            pass = false;
            break;
          }
        }
        if (!pass) continue;
        count++;
        if (needsTrajectories) {
          const t = Number(typeof row[timeIdx] === "bigint" ? Number(row[timeIdx]) : row[timeIdx]);
          const eid = typeof row[entityIdx] === "bigint" ? Number(row[entityIdx]) : row[entityIdx];
          const grp = groupIdx >= 0 ? String(row[groupIdx] ?? "") : "";
          const lon = Number(row[lonIdx]);
          const lat = Number(row[latIdx]);
          const elev = elevIdx >= 0 ? Number(row[elevIdx]) || 0 : 0;
          if (Number.isFinite(t) && Number.isFinite(lon) && Number.isFinite(lat)) {
            const key = grp ? `${grp}-${eid}` : String(eid);
            let arr = trajMap.get(key);
            if (!arr) { arr = []; trajMap.set(key, arr); }
            arr.push([t, lon, lat, elev]);

            const ev = String(row[eventIdx] ?? "");
            if (ev === "ACQU") {
              let acq = acquMap.get(key);
              if (!acq) { acq = []; acquMap.set(key, acq); }
              acq.push([t, lon, lat, elev]);
            }
          }
        }
      }
    };

    // For trajectory loading, stream progress row-group-by-row-group
    if (needsTrajectories) {
      const rowGroups: RowGroup[] = metadata.row_groups;
      const totalRows = Number(metadata.num_rows);

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (obj: unknown) => {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          };

          try {
            let processedRows = 0;
            send({ type: "progress", progress: 0, message: `Reading ${totalRows.toLocaleString()} rows…` });

            for (let rgIdx = 0; rgIdx < rowGroups.length; rgIdx++) {
              const rgRows = Number(rowGroups[rgIdx].num_rows);
              const rowStart = processedRows;
              const rowEnd = processedRows + rgRows;

              await parquetRead({
                file,
                columns: columnsNeeded,
                rowStart,
                rowEnd,
                onComplete(rows) {
                  processRows(rows as unknown[][] | undefined);
                },
              });

              processedRows = rowEnd;
              const progress = processedRows / totalRows;
              send({
                type: "progress",
                progress,
                message: `Read ${processedRows.toLocaleString()} / ${totalRows.toLocaleString()} rows (${count.toLocaleString()} matched)`,
              });
            }

            // Build sorted trajectory list
            send({ type: "progress", progress: 1, message: "Sorting…" });
            const trajEntries: { id: string; positions: Pos[]; acqu: Pos[] }[] = [];
            for (const [id, positions] of trajMap) {
              positions.sort((a, b) => a[0] - b[0]);
              const acqu = acquMap.get(id) ?? [];
              acqu.sort((a, b) => a[0] - b[0]);
              trajEntries.push({ id: String(id), positions, acqu });
            }
            trajEntries.sort((a, b) => a.id.localeCompare(b.id));

            // Signal binary payload follows
            send({
              type: "binary_start",
              count,
              hasElevation,
              numEntities: trajEntries.length,
            });

            // Encode trajectories as binary:
            // [uint32 numEntities]
            // per entity: [uint32 idLen][utf8 id][uint32 numPos][uint32 numAcqu]
            //             [float64 × numPos×4][float64 × numAcqu×4]
            const hdr = new ArrayBuffer(4);
            new DataView(hdr).setUint32(0, trajEntries.length, true);
            controller.enqueue(new Uint8Array(hdr));

            for (const traj of trajEntries) {
              const idBytes = new TextEncoder().encode(traj.id);
              const meta = new ArrayBuffer(4 + idBytes.length + 4 + 4);
              const mv = new DataView(meta);
              let mo = 0;
              mv.setUint32(mo, idBytes.length, true); mo += 4;
              new Uint8Array(meta, mo, idBytes.length).set(idBytes); mo += idBytes.length;
              mv.setUint32(mo, traj.positions.length, true); mo += 4;
              mv.setUint32(mo, traj.acqu.length, true);
              controller.enqueue(new Uint8Array(meta));

              // Positions as flat Float64
              if (traj.positions.length > 0) {
                const flat = new Float64Array(traj.positions.length * 4);
                for (let j = 0; j < traj.positions.length; j++) {
                  const p = traj.positions[j];
                  flat[j * 4] = p[0]; flat[j * 4 + 1] = p[1];
                  flat[j * 4 + 2] = p[2]; flat[j * 4 + 3] = p[3];
                }
                controller.enqueue(new Uint8Array(flat.buffer));
              }

              // ACQU as flat Float64
              if (traj.acqu.length > 0) {
                const flat = new Float64Array(traj.acqu.length * 4);
                for (let j = 0; j < traj.acqu.length; j++) {
                  const a = traj.acqu[j];
                  flat[j * 4] = a[0]; flat[j * 4 + 1] = a[1];
                  flat[j * 4 + 2] = a[2]; flat[j * 4 + 3] = a[3];
                }
                controller.enqueue(new Uint8Array(flat.buffer));
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            send({ type: "error", error: msg });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Non-trajectory count: read all at once
    await parquetRead({
      file,
      columns: columnsNeeded,
      onComplete(rows) {
        processRows(rows as unknown[][] | undefined);
      },
    });

    return Response.json({ count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
