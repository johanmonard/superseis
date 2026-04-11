import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

// Slice an in-memory Float32 elevation raster (in EPSG:3857) into a
// MapLibre-compatible terrain-rgb PNG tile pyramid. Used to make a saved
// DEM consumable by `map.setTerrain` (which can't read raw GeoTIFF).

const WORLD_HALF = 20037508.342789244;
const TILE_PX = 256;
// Hard cap so a fine-zoom import over a wide area can't blow up the
// tile count. We lower the pyramid's maxZoom until we're back under it.
const MAX_TILES = 600;

export type DemTilePyramid = {
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number]; // lng/lat
  encoding: "terrarium";
  tilesWritten: number;
};

export type DemMosaic = {
  // Source raster, row-major. The pixel at (col, row) covers the
  // Web-Mercator square anchored at originX + col*pixelSize, originY -
  // row*pixelSize, with side length `pixelSize` meters.
  data: Float32Array;
  width: number;
  height: number;
  originX: number; // Web Mercator metres, top-left
  originY: number;
  pixelSize: number; // metres per source pixel
};

// EPSG:3857 (web mercator metres) → lng/lat degrees.
function mercToLngLat(x: number, y: number): [number, number] {
  const lng = (x / WORLD_HALF) * 180;
  const lat =
    (Math.atan(Math.exp((y / WORLD_HALF) * Math.PI)) * 360) / Math.PI - 90;
  return [lng, lat];
}

// Smallest zoom whose 256px tile pixel is >= the source pixel. One step
// past that gives a pyramid that doesn't oversample the source data.
function pyramidMaxZoom(pixelSize: number): number {
  // tilePixelSize(z) = WORLD_HALF / (128 * 2^z) = pixelSize
  // → z = log2(WORLD_HALF / (128 * pixelSize))
  const z = Math.log2(WORLD_HALF / (128 * pixelSize));
  return Math.max(0, Math.min(18, Math.round(z)));
}

// terrain-rgb (Mapzen Terrarium) encoding: stores elevation in metres
// with 1/256 m precision; identical to what AWS Terrarium tiles use, so
// MapLibre can decode it with `encoding: "terrarium"`.
function encodeTerrarium(e: number): [number, number, number] {
  const v = e + 32768;
  const r = Math.max(0, Math.min(255, Math.floor(v / 256)));
  const g = Math.max(0, Math.min(255, Math.floor(v) % 256));
  const b = Math.max(0, Math.min(255, Math.floor((v - Math.floor(v)) * 256)));
  return [r, g, b];
}

function tileBounds3857(z: number, x: number, y: number) {
  const tileSize = (2 * WORLD_HALF) / 2 ** z;
  return {
    left: x * tileSize - WORLD_HALF,
    right: (x + 1) * tileSize - WORLD_HALF,
    top: WORLD_HALF - y * tileSize,
    bottom: WORLD_HALF - (y + 1) * tileSize,
  };
}

// Bilinear sample of the source raster at fractional pixel (col, row).
// Out-of-range coords are clamped to the edge so partial-coverage tiles
// degrade gracefully (no cliffs at the boundary).
function sampleBilinear(m: DemMosaic, col: number, row: number): number {
  const c0 = Math.max(0, Math.min(m.width - 1, Math.floor(col)));
  const r0 = Math.max(0, Math.min(m.height - 1, Math.floor(row)));
  const c1 = Math.max(0, Math.min(m.width - 1, c0 + 1));
  const r1 = Math.max(0, Math.min(m.height - 1, r0 + 1));
  const fc = Math.max(0, Math.min(1, col - c0));
  const fr = Math.max(0, Math.min(1, row - r0));
  const v00 = m.data[r0 * m.width + c0];
  const v10 = m.data[r0 * m.width + c1];
  const v01 = m.data[r1 * m.width + c0];
  const v11 = m.data[r1 * m.width + c1];
  return (
    v00 * (1 - fc) * (1 - fr) +
    v10 * fc * (1 - fr) +
    v01 * (1 - fc) * fr +
    v11 * fc * fr
  );
}

function tileRangeForZoom(
  z: number,
  left3857: number,
  bottom3857: number,
  right3857: number,
  top3857: number
) {
  const tileSize = (2 * WORLD_HALF) / 2 ** z;
  return {
    txMin: Math.floor((left3857 + WORLD_HALF) / tileSize),
    txMax: Math.floor((right3857 + WORLD_HALF - 1e-9) / tileSize),
    tyMin: Math.floor((WORLD_HALF - top3857) / tileSize),
    tyMax: Math.floor((WORLD_HALF - bottom3857 - 1e-9) / tileSize),
  };
}

export async function writeDemTilePyramid(
  m: DemMosaic,
  outDir: string
): Promise<DemTilePyramid> {
  // Wipe any prior pyramid for this name so re-imports don't leak stale
  // tiles outside the new bounds.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const left = m.originX;
  const top = m.originY;
  const right = m.originX + m.width * m.pixelSize;
  const bottom = m.originY - m.height * m.pixelSize;

  // Pick maxZoom from source resolution; back off until total tiles ≤
  // MAX_TILES so a coarse-but-wide DEM can't explode the count.
  let maxZoom = pyramidMaxZoom(m.pixelSize);
  let minZoom = Math.max(0, maxZoom - 3);
  let plan: Array<{
    z: number;
    txMin: number;
    txMax: number;
    tyMin: number;
    tyMax: number;
  }> = [];
  for (;;) {
    plan = [];
    let total = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
      const r = tileRangeForZoom(z, left, bottom, right, top);
      total +=
        Math.max(0, r.txMax - r.txMin + 1) *
        Math.max(0, r.tyMax - r.tyMin + 1);
      plan.push({ z, ...r });
    }
    if (total <= MAX_TILES || maxZoom === 0) break;
    maxZoom -= 1;
    minZoom = Math.max(0, maxZoom - 3);
  }

  let tilesWritten = 0;
  for (const { z, txMin, txMax, tyMin, tyMax } of plan) {
    const tileSize3857 = (2 * WORLD_HALF) / 2 ** z;
    const stepWorld = tileSize3857 / TILE_PX; // metres per tile pixel
    for (let tx = txMin; tx <= txMax; tx++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        const tb = tileBounds3857(z, tx, ty);
        // Skip tiles fully outside the DEM — the serving route will
        // proxy them from AWS.
        if (
          tb.right <= left ||
          tb.left >= right ||
          tb.top <= bottom ||
          tb.bottom >= top
        ) {
          continue;
        }
        const png = new PNG({ width: TILE_PX, height: TILE_PX });
        const out = png.data;
        for (let py = 0; py < TILE_PX; py++) {
          const worldY = tb.top - (py + 0.5) * stepWorld;
          const srcRow = (m.originY - worldY) / m.pixelSize - 0.5;
          for (let px = 0; px < TILE_PX; px++) {
            const worldX = tb.left + (px + 0.5) * stepWorld;
            const srcCol = (worldX - m.originX) / m.pixelSize - 0.5;
            const elev = sampleBilinear(m, srcCol, srcRow);
            const [r, g, b] = encodeTerrarium(elev);
            const i = (py * TILE_PX + px) * 4;
            out[i] = r;
            out[i + 1] = g;
            out[i + 2] = b;
            out[i + 3] = 255;
          }
        }
        const buf = PNG.sync.write(png);
        const dir = join(outDir, String(z), String(tx));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${ty}.png`), buf);
        tilesWritten += 1;
      }
    }
  }

  const [west, south] = mercToLngLat(left, bottom);
  const [east, north] = mercToLngLat(right, top);

  const manifest: DemTilePyramid = {
    minZoom,
    maxZoom,
    bounds: [west, south, east, north],
    encoding: "terrarium",
    tilesWritten,
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}
