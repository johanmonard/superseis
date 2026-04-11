import type { Database } from "sql.js";
import proj4 from "proj4";

// ---------------------------------------------------------------------------
// GeoPackage ↔ GeoJSON (WGS84) converter (client-side via sql.js + proj4)
// Handles Point, LineString, Polygon and their Multi* variants.
// Automatically reprojects between the source CRS and EPSG:4326.
// ---------------------------------------------------------------------------

type GeoJSONGeometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPoint"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | null;

type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: GeoJSONGeometry;
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

export type GpkgMeta = {
  tableName: string;
  geomCol: string;
  srsId: number;
  pkCol: string;
  geometryType: string;
};

// ==========================================================================
// Binary reader
// ==========================================================================

class BinaryReader {
  private view: DataView;
  private pos: number;
  le: boolean;

  constructor(buf: ArrayBuffer, offset = 0, littleEndian = true) {
    this.view = new DataView(buf);
    this.pos = offset;
    this.le = littleEndian;
  }

  get offset() {
    return this.pos;
  }
  set offset(v: number) {
    this.pos = v;
  }

  readUint8(): number {
    return this.view.getUint8(this.pos++);
  }

  readUint32(): number {
    const v = this.view.getUint32(this.pos, this.le);
    this.pos += 4;
    return v;
  }

  readFloat64(): number {
    const v = this.view.getFloat64(this.pos, this.le);
    this.pos += 8;
    return v;
  }
}

// ==========================================================================
// Binary writer
// ==========================================================================

class BinaryWriter {
  private buf: number[] = [];
  private le = true;

  writeUint8(v: number) {
    this.buf.push(v & 0xff);
  }

  writeUint32(v: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, v, this.le);
    this.buf.push(...new Uint8Array(b));
  }

  writeFloat64(v: number) {
    const b = new ArrayBuffer(8);
    new DataView(b).setFloat64(0, v, this.le);
    this.buf.push(...new Uint8Array(b));
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ==========================================================================
// GPKG Binary header parsing
// ==========================================================================

function gpkgHeaderSize(buf: ArrayBuffer): number {
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return 0;

  const flags = bytes[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envelopeDoubles = [0, 4, 6, 6, 8][envelopeType] ?? 0;

  return 8 + envelopeDoubles * 8;
}

// ==========================================================================
// WKB → GeoJSON (decode)
// ==========================================================================

function readCoord(r: BinaryReader, dims: number): number[] {
  const c = [r.readFloat64(), r.readFloat64()];
  for (let i = 2; i < dims; i++) r.readFloat64();
  return c;
}

function readRing(r: BinaryReader, dims: number): number[][] {
  const n = r.readUint32();
  const ring: number[][] = [];
  for (let i = 0; i < n; i++) ring.push(readCoord(r, dims));
  return ring;
}

function parseWkbGeometry(r: BinaryReader): GeoJSONGeometry {
  const byteOrder = r.readUint8();
  r.le = byteOrder === 1;

  let wkbType = r.readUint32();

  let dims = 2;
  if (wkbType > 3000) {
    dims = 4;
    wkbType -= 3000;
  } else if (wkbType > 2000) {
    dims = 3;
    wkbType -= 2000;
  } else if (wkbType > 1000) {
    dims = 3;
    wkbType -= 1000;
  }

  switch (wkbType) {
    case 1:
      return { type: "Point", coordinates: readCoord(r, dims) };
    case 2: {
      const n = r.readUint32();
      const coords: number[][] = [];
      for (let i = 0; i < n; i++) coords.push(readCoord(r, dims));
      return { type: "LineString", coordinates: coords };
    }
    case 3: {
      const nRings = r.readUint32();
      const rings: number[][][] = [];
      for (let i = 0; i < nRings; i++) rings.push(readRing(r, dims));
      return { type: "Polygon", coordinates: rings };
    }
    case 4: {
      const n = r.readUint32();
      const pts: number[][] = [];
      for (let i = 0; i < n; i++) {
        const g = parseWkbGeometry(r);
        if (g?.type === "Point") pts.push(g.coordinates);
      }
      return { type: "MultiPoint", coordinates: pts };
    }
    case 5: {
      const n = r.readUint32();
      const lines: number[][][] = [];
      for (let i = 0; i < n; i++) {
        const g = parseWkbGeometry(r);
        if (g?.type === "LineString") lines.push(g.coordinates);
      }
      return { type: "MultiLineString", coordinates: lines };
    }
    case 6: {
      const n = r.readUint32();
      const polys: number[][][][] = [];
      for (let i = 0; i < n; i++) {
        const g = parseWkbGeometry(r);
        if (g?.type === "Polygon") polys.push(g.coordinates);
      }
      return { type: "MultiPolygon", coordinates: polys };
    }
    default:
      return null;
  }
}

function parseGpkgGeometry(blob: Uint8Array): GeoJSONGeometry {
  const buf = new ArrayBuffer(blob.byteLength);
  new Uint8Array(buf).set(blob);
  const wkbOffset = gpkgHeaderSize(buf);
  if (wkbOffset === 0 && blob[0] !== 0 && blob[0] !== 1) return null;
  const r = new BinaryReader(buf, wkbOffset);
  return parseWkbGeometry(r);
}

// ==========================================================================
// GeoJSON → WKB → GPKG Binary (encode)
// ==========================================================================

const WKB_TYPES: Record<string, number> = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
};

function writeCoord(w: BinaryWriter, c: number[]) {
  w.writeFloat64(c[0]);
  w.writeFloat64(c[1]);
}

function writeRing(w: BinaryWriter, ring: number[][]) {
  w.writeUint32(ring.length);
  for (const c of ring) writeCoord(w, c);
}

function writeWkbGeometry(w: BinaryWriter, geom: GeoJSONGeometry) {
  if (!geom) return;

  w.writeUint8(1); // little-endian
  w.writeUint32(WKB_TYPES[geom.type] ?? 0);

  switch (geom.type) {
    case "Point":
      writeCoord(w, geom.coordinates);
      break;
    case "LineString":
      w.writeUint32(geom.coordinates.length);
      for (const c of geom.coordinates) writeCoord(w, c);
      break;
    case "Polygon":
      w.writeUint32(geom.coordinates.length);
      for (const ring of geom.coordinates) writeRing(w, ring);
      break;
    case "MultiPoint":
      w.writeUint32(geom.coordinates.length);
      for (const c of geom.coordinates)
        writeWkbGeometry(w, { type: "Point", coordinates: c });
      break;
    case "MultiLineString":
      w.writeUint32(geom.coordinates.length);
      for (const line of geom.coordinates)
        writeWkbGeometry(w, { type: "LineString", coordinates: line });
      break;
    case "MultiPolygon":
      w.writeUint32(geom.coordinates.length);
      for (const poly of geom.coordinates)
        writeWkbGeometry(w, { type: "Polygon", coordinates: poly });
      break;
  }
}

function computeEnvelope(geom: GeoJSONGeometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function visit(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      const [x, y] = coords as number[];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      for (const c of coords) visit(c);
    }
  }

  if (geom) visit(geom.coordinates);
  return [minX, maxX, minY, maxY];
}

function encodeGpkgGeometry(geom: GeoJSONGeometry, srsId: number): Uint8Array {
  const wkb = new BinaryWriter();
  writeWkbGeometry(wkb, geom);
  const wkbBytes = wkb.toUint8Array();

  const [minX, maxX, minY, maxY] = computeEnvelope(geom);

  // GPKG header: magic(2) + version(1) + flags(1) + srs_id(4) + envelope(32)
  const header = new BinaryWriter();
  header.writeUint8(0x47); // 'G'
  header.writeUint8(0x50); // 'P'
  header.writeUint8(0);    // version
  header.writeUint8(0x03); // flags: little-endian + envelope type 1 (xy)
  header.writeUint32(srsId);
  header.writeFloat64(minX);
  header.writeFloat64(maxX);
  header.writeFloat64(minY);
  header.writeFloat64(maxY);

  const headerBytes = header.toUint8Array();
  const result = new Uint8Array(headerBytes.length + wkbBytes.length);
  result.set(headerBytes);
  result.set(wkbBytes, headerBytes.length);
  return result;
}

// ==========================================================================
// Coordinate reprojection
// ==========================================================================

type Transform = (coord: number[]) => number[];

function registerCrs(db: Database, srsId: number): string | null {
  if (srsId === 4326) return null;

  const rows = db.exec(
    `SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id = ${srsId}`
  );
  if (!rows.length || !rows[0].values.length) return null;

  const wkt = rows[0].values[0][0] as string;
  if (!wkt || wkt === "undefined") return null;

  const srcKey = `EPSG:${srsId}`;
  proj4.defs(srcKey, wkt);
  return srcKey;
}

function buildForwardTransform(srcKey: string): Transform {
  const fwd = proj4(srcKey, "EPSG:4326");
  return (coord) => {
    const [lng, lat] = fwd.forward(coord);
    return [lng, lat];
  };
}

function buildInverseTransform(srcKey: string): Transform {
  const fwd = proj4(srcKey, "EPSG:4326");
  return (coord) => {
    const [x, y] = fwd.inverse(coord);
    return [x, y];
  };
}

function reprojectGeometry(
  geom: GeoJSONGeometry,
  transform: Transform
): GeoJSONGeometry {
  if (!geom) return null;

  const t = (c: number[]) => transform(c);
  const tRing = (ring: number[][]) => ring.map(t);
  const tPoly = (poly: number[][][]) => poly.map(tRing);

  switch (geom.type) {
    case "Point":
      return { type: "Point", coordinates: t(geom.coordinates) };
    case "LineString":
      return { type: "LineString", coordinates: geom.coordinates.map(t) };
    case "Polygon":
      return { type: "Polygon", coordinates: tPoly(geom.coordinates) };
    case "MultiPoint":
      return { type: "MultiPoint", coordinates: geom.coordinates.map(t) };
    case "MultiLineString":
      return { type: "MultiLineString", coordinates: geom.coordinates.map(tRing) };
    case "MultiPolygon":
      return { type: "MultiPolygon", coordinates: geom.coordinates.map(tPoly) };
    default:
      return null;
  }
}

// ==========================================================================
// Read: GPKG → GeoJSON
// ==========================================================================

export type GpkgReadResult = {
  geojson: GeoJSONFeatureCollection;
  meta: GpkgMeta;
};

export function gpkgToGeoJSON(db: Database): GpkgReadResult {
  const contents = db.exec(
    "SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features'"
  );
  if (!contents.length || !contents[0].values.length) {
    return {
      geojson: { type: "FeatureCollection", features: [] },
      meta: { tableName: "", geomCol: "geom", srsId: 4326, pkCol: "fid", geometryType: "GEOMETRY" },
    };
  }

  const tableName = contents[0].values[0][0] as string;
  const srsId = contents[0].values[0][1] as number;

  const geomCols = db.exec(
    `SELECT column_name, geometry_type_name FROM gpkg_geometry_columns WHERE table_name = '${tableName}'`
  );
  const geomCol = geomCols.length ? (geomCols[0].values[0][0] as string) : "geom";
  const geometryType = geomCols.length
    ? ((geomCols[0].values[0][1] as string) ?? "GEOMETRY").toUpperCase()
    : "GEOMETRY";

  // Detect primary key column
  const pkRows = db.exec(`PRAGMA table_info("${tableName}")`);
  let pkCol = "fid";
  if (pkRows.length) {
    for (const row of pkRows[0].values) {
      if (row[5] === 1) {
        pkCol = row[1] as string;
        break;
      }
    }
  }

  const srcKey = registerCrs(db, srsId);
  const transform = srcKey ? buildForwardTransform(srcKey) : null;

  const result = db.exec(`SELECT * FROM "${tableName}"`);
  if (!result.length) {
    return {
      geojson: { type: "FeatureCollection", features: [] },
      meta: { tableName, geomCol, srsId, pkCol, geometryType },
    };
  }

  const { columns, values } = result[0];
  const geomIdx = columns.indexOf(geomCol);

  const features: GeoJSONFeature[] = [];

  for (const row of values) {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      if (i === geomIdx) continue;
      properties[columns[i]] = row[i];
    }

    const geomBlob = row[geomIdx];
    let geometry: GeoJSONGeometry = null;
    if (geomBlob instanceof Uint8Array) {
      geometry = parseGpkgGeometry(geomBlob);
      if (geometry && transform) {
        geometry = reprojectGeometry(geometry, transform);
      }
    }

    features.push({ type: "Feature", properties, geometry });
  }

  return {
    geojson: { type: "FeatureCollection", features },
    meta: { tableName, geomCol, srsId, pkCol, geometryType },
  };
}

// ==========================================================================
// Write: GeoJSON → GPKG (update features in-place)
// ==========================================================================

export function updateGpkgFeatures(
  db: Database,
  meta: GpkgMeta,
  features: GeoJSONFeature[]
): void {
  const srcKey = meta.srsId !== 4326 ? `EPSG:${meta.srsId}` : null;
  const inverse = srcKey ? buildInverseTransform(srcKey) : null;

  // Drop SpatiaLite triggers that reference functions sql.js doesn't have
  // (ST_IsEmpty, ST_MinX, etc.), save their SQL so we can recreate them.
  const triggerRows = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${meta.tableName}'`
  );
  const triggers: { name: string; sql: string }[] = [];
  if (triggerRows.length) {
    for (const row of triggerRows[0].values) {
      triggers.push({ name: row[0] as string, sql: row[1] as string });
      db.exec(`DROP TRIGGER IF EXISTS "${row[0] as string}"`);
    }
  }

  for (const feature of features) {
    const pk = feature.properties[meta.pkCol];
    if (pk == null) continue;

    let geom = feature.geometry;
    if (geom && inverse) {
      geom = reprojectGeometry(geom, inverse);
    }

    if (geom) {
      const blob = encodeGpkgGeometry(geom, meta.srsId);
      db.exec(
        `UPDATE "${meta.tableName}" SET "${meta.geomCol}" = x'${uint8ToHex(blob)}' WHERE "${meta.pkCol}" = ${typeof pk === "string" ? `'${pk}'` : pk}`
      );
    }
  }

  // Restore triggers
  for (const t of triggers) {
    db.exec(t.sql);
  }
}

// Runtime-only properties added by the UI layer that should never be
// written to the GeoPackage. Also filtered out of column inference.
const RUNTIME_PROPS = new Set(["__dirty", "__layer"]);

export function insertGpkgFeatures(
  db: Database,
  meta: GpkgMeta,
  features: GeoJSONFeature[]
): number[] {
  if (features.length === 0) return [];

  const srcKey = meta.srsId !== 4326 ? `EPSG:${meta.srsId}` : null;
  const inverse = srcKey ? buildInverseTransform(srcKey) : null;

  const triggerRows = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${meta.tableName}'`
  );
  const triggers: { name: string; sql: string }[] = [];
  if (triggerRows.length) {
    for (const row of triggerRows[0].values) {
      triggers.push({ name: row[0] as string, sql: row[1] as string });
      db.exec(`DROP TRIGGER IF EXISTS "${row[0] as string}"`);
    }
  }

  const pks: number[] = [];
  for (const feature of features) {
    let geom = feature.geometry;
    if (!geom) continue;
    if (inverse) geom = reprojectGeometry(geom, inverse);

    const blob = encodeGpkgGeometry(geom, meta.srsId);

    // Collect writable property columns, skipping runtime markers and
    // the geom/pk columns. Unknown columns are ALTER-added on first use
    // so union-schema edit files can accept any source's attributes.
    // Null-valued properties still need their column — fall back to
    // TEXT affinity when we can't infer from the value (SQLite is loose
    // about types so this is safe for later non-null writes).
    const writable: [string, unknown][] = [];
    const needed = new Map<string, string>();
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (key === meta.pkCol || key === meta.geomCol) continue;
      if (RUNTIME_PROPS.has(key)) continue;
      if (value === undefined) continue;
      if (!IDENT_RE.test(key)) continue;
      writable.push([key, value]);
      needed.set(key, value !== null ? inferSqlType(value) : "TEXT");
    }
    ensureGpkgColumns(db, meta.tableName, needed);

    const cols = [`"${meta.geomCol}"`];
    const placeholders = [`x'${uint8ToHex(blob)}'`];
    const params: (string | number | null)[] = [];
    for (const [key, value] of writable) {
      cols.push(`"${key}"`);
      if (value === null) {
        placeholders.push("NULL");
      } else if (typeof value === "boolean") {
        placeholders.push("?");
        params.push(value ? 1 : 0);
      } else if (typeof value === "number" || typeof value === "string") {
        placeholders.push("?");
        params.push(value);
      } else {
        placeholders.push("?");
        params.push(JSON.stringify(value));
      }
    }

    const sql = `INSERT INTO "${meta.tableName}" (${cols.join(",")}) VALUES (${placeholders.join(",")})`;
    if (params.length > 0) {
      db.run(sql, params);
    } else {
      db.exec(sql);
    }
    const res = db.exec("SELECT last_insert_rowid()");
    pks.push(res[0].values[0][0] as number);
  }

  for (const t of triggers) {
    db.exec(t.sql);
  }

  return pks;
}

// ==========================================================================
// Dynamic schema helpers — used by the "user edits" GPKG files so that
// features transferred from different source layers can carry their full
// set of attribute columns (new columns are ALTER-added on first use).
// ==========================================================================

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function inferSqlType(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? "INTEGER" : "REAL";
  }
  if (typeof v === "boolean") return "INTEGER";
  return "TEXT";
}

export function ensureGpkgColumns(
  db: Database,
  tableName: string,
  columns: ReadonlyMap<string, string>
): void {
  if (columns.size === 0) return;
  const info = db.exec(`PRAGMA table_info("${tableName}")`);
  const existing = new Set<string>();
  if (info.length) {
    for (const row of info[0].values) existing.add(row[1] as string);
  }
  for (const [name, sqlType] of columns) {
    if (existing.has(name)) continue;
    if (!IDENT_RE.test(name)) continue;
    db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${name}" ${sqlType}`);
  }
}

const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';

export type GpkgInitGeomType =
  | "POINT"
  | "LINESTRING"
  | "POLYGON"
  | "MULTIPOINT"
  | "MULTILINESTRING"
  | "MULTIPOLYGON"
  | "GEOMETRY";

export function initializeGpkgSchema(
  db: Database,
  opts: {
    tableName: string;
    geometryType: GpkgInitGeomType;
    srsId?: number;
  }
): GpkgMeta {
  const srsId = opts.srsId ?? 4326;
  if (!IDENT_RE.test(opts.tableName)) {
    throw new Error(`Invalid GPKG table name: ${opts.tableName}`);
  }

  db.exec(`PRAGMA application_id = 1196444487`); // 'GPKG'
  db.exec(`PRAGMA user_version = 10200`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL,
      description TEXT
    )
  `);
  db.exec(
    `INSERT OR IGNORE INTO gpkg_spatial_ref_sys VALUES
      ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system')`
  );
  db.exec(
    `INSERT OR IGNORE INTO gpkg_spatial_ref_sys VALUES
      ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system')`
  );
  db.exec(
    `INSERT OR IGNORE INTO gpkg_spatial_ref_sys VALUES
      ('WGS 84', 4326, 'EPSG', 4326, '${WGS84_WKT.replace(/'/g, "''")}', 'WGS 84 / Geodetic lat/lng')`
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY,
      data_type TEXT NOT NULL,
      identifier TEXT UNIQUE,
      description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x DOUBLE,
      min_y DOUBLE,
      max_x DOUBLE,
      max_y DOUBLE,
      srs_id INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gpkg_geometry_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL,
      m TINYINT NOT NULL,
      PRIMARY KEY (table_name, column_name)
    )
  `);

  db.exec(`
    CREATE TABLE "${opts.tableName}" (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB
    )
  `);

  db.exec(
    `INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id)
     VALUES ('${opts.tableName}', 'features', '${opts.tableName}', ${srsId})`
  );
  db.exec(
    `INSERT INTO gpkg_geometry_columns
     VALUES ('${opts.tableName}', 'geom', '${opts.geometryType}', ${srsId}, 0, 0)`
  );

  return {
    tableName: opts.tableName,
    geomCol: "geom",
    srsId,
    pkCol: "fid",
    geometryType: opts.geometryType,
  };
}

export function deleteGpkgFeatures(
  db: Database,
  meta: GpkgMeta,
  pks: ReadonlyArray<number | string>
): void {
  if (pks.length === 0) return;

  const triggerRows = db.exec(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = '${meta.tableName}'`
  );
  const triggers: { name: string; sql: string }[] = [];
  if (triggerRows.length) {
    for (const row of triggerRows[0].values) {
      triggers.push({ name: row[0] as string, sql: row[1] as string });
      db.exec(`DROP TRIGGER IF EXISTS "${row[0] as string}"`);
    }
  }

  const quoted = pks
    .map((pk) => (typeof pk === "string" ? `'${pk.replace(/'/g, "''")}'` : pk))
    .join(",");
  db.exec(
    `DELETE FROM "${meta.tableName}" WHERE "${meta.pkCol}" IN (${quoted})`
  );

  for (const t of triggers) {
    db.exec(t.sql);
  }
}

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function exportDatabase(db: Database): Uint8Array {
  return db.export();
}
