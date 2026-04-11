import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fromArrayBuffer, writeArrayBuffer } from "geotiff";
import { writeDemTilePyramid } from "@/lib/dem-tiles";

const GIS_DIR = join(process.cwd(), "share", "gis");

// AWS Open Data "Terrain Tiles" — single-band Int16 elevation in meters,
// EPSG:3857, 512×512 px per tile.
//   https://registry.opendata.aws/terrain-tiles/
const TILE_HOST = "https://elevation-tiles-prod.s3.amazonaws.com/geotiff";
const TILE_SIZE = 512;
const WORLD_HALF = 20037508.342789244;
const MAX_PIXELS = 4_000_000; // ~16 MB Float32 mosaic cap
const MAX_ZOOM = 14;

function lngLatToMerc(lng: number, lat: number): [number, number] {
  const x = (lng * WORLD_HALF) / 180;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const y =
    Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)) *
    (WORLD_HALF / Math.PI);
  return [x, y];
}

function tileRange(z: number, west: number, south: number, east: number, north: number) {
  const [xMin, yMin] = lngLatToMerc(west, south);
  const [xMax, yMax] = lngLatToMerc(east, north);
  const px = (2 * WORLD_HALF) / (TILE_SIZE * 2 ** z);
  const tilePx = TILE_SIZE * px;
  return {
    px,
    txMin: Math.floor((xMin + WORLD_HALF) / tilePx),
    txMax: Math.floor((xMax + WORLD_HALF) / tilePx),
    tyMin: Math.floor((WORLD_HALF - yMax) / tilePx),
    tyMax: Math.floor((WORLD_HALF - yMin) / tilePx),
  };
}

function pickZoom(
  west: number,
  south: number,
  east: number,
  north: number,
  maxZoom: number = MAX_ZOOM
) {
  for (let z = maxZoom; z >= 0; z--) {
    const r = tileRange(z, west, south, east, north);
    const w = (r.txMax - r.txMin + 1) * TILE_SIZE;
    const h = (r.tyMax - r.tyMin + 1) * TILE_SIZE;
    if (w * h <= MAX_PIXELS) return { zoom: z, ...r };
  }
  return { zoom: 0, ...tileRange(0, west, south, east, north) };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const b = body as { bbox?: number[]; name?: string; maxZoom?: number };
  const bbox = b.bbox;
  const rawName = (b.name ?? "").trim();
  const requestedMaxZoom =
    typeof b.maxZoom === "number" && b.maxZoom >= 0 && b.maxZoom <= MAX_ZOOM
      ? Math.floor(b.maxZoom)
      : MAX_ZOOM;

  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((n) => Number.isFinite(n)) ||
    !rawName
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const safe = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const filename = safe.endsWith(".tif") ? safe : `${safe}.tif`;

  const [west, south, east, north] = bbox as [number, number, number, number];
  if (west >= east || south >= north) {
    return new Response("Degenerate bbox", { status: 400 });
  }

  const { zoom, px, txMin, txMax, tyMin, tyMax } = pickZoom(
    west,
    south,
    east,
    north,
    requestedMaxZoom
  );
  const cols = txMax - txMin + 1;
  const rows = tyMax - tyMin + 1;
  const width = cols * TILE_SIZE;
  const height = rows * TILE_SIZE;
  const mosaic = new Float32Array(width * height);
  const tilesMax = 2 ** zoom;

  let fetched = 0;
  let missing = 0;

  await Promise.all(
    Array.from({ length: cols * rows }, async (_, i) => {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      const tx = ((txMin + cx) % tilesMax + tilesMax) % tilesMax;
      const ty = tyMin + cy;
      if (ty < 0 || ty >= tilesMax) {
        missing++;
        return;
      }
      const url = `${TILE_HOST}/${zoom}/${tx}/${ty}.tif`;
      const res = await fetch(url);
      if (!res.ok) {
        missing++;
        return;
      }
      const buf = await res.arrayBuffer();
      const tiff = await fromArrayBuffer(buf);
      const img = await tiff.getImage();
      const tw = img.getWidth();
      const th = img.getHeight();
      const rasters = await img.readRasters();
      const src = rasters[0] as ArrayLike<number>;
      const offX = cx * TILE_SIZE;
      const offY = cy * TILE_SIZE;
      const copyW = Math.min(tw, width - offX);
      const copyH = Math.min(th, height - offY);
      for (let row = 0; row < copyH; row++) {
        const dst = (offY + row) * width + offX;
        const srcRow = row * tw;
        for (let col = 0; col < copyW; col++) {
          mosaic[dst + col] = src[srcRow + col];
        }
      }
      fetched++;
    })
  );

  if (fetched === 0) {
    return new Response("No DEM tiles available for this area", { status: 502 });
  }

  const left = txMin * TILE_SIZE * px - WORLD_HALF;
  const top = WORLD_HALF - tyMin * TILE_SIZE * px;

  const tiffBuf = writeArrayBuffer(mosaic, {
    width,
    height,
    ModelPixelScale: [px, px, 0],
    ModelTiepoint: [0, 0, 0, left, top, 0],
    ProjectedCSTypeGeoKey: 3857,
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    GTCitationGeoKey: "WGS 84 / Pseudo-Mercator",
  });

  await writeFile(join(GIS_DIR, filename), Buffer.from(tiffBuf as ArrayBuffer));

  // Slice the same in-memory mosaic into a terrain-rgb PNG pyramid so
  // MapLibre's setTerrain can consume it. Stored alongside the .tif as a
  // sibling directory.
  const baseName = filename.replace(/\.tif$/i, "");
  const tilesDir = join(GIS_DIR, `${baseName}_tiles`);
  const pyramid = await writeDemTilePyramid(
    {
      data: mosaic,
      width,
      height,
      originX: left,
      originY: top,
      pixelSize: px,
    },
    tilesDir
  );

  return Response.json({
    ok: true,
    file: filename,
    zoom,
    width,
    height,
    tiles: cols * rows,
    fetched,
    missing,
    pyramid,
  });
}
