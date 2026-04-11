import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GIS_DIR = join(process.cwd(), "share", "gis");
const AWS_FALLBACK =
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium";

// Serve a single terrain-rgb tile for a saved DEM. If the requested
// {z}/{x}/{y} falls outside the DEM (no local PNG exists) we transparently
// proxy the same tile from AWS Terrarium so MapLibre still gets a valid
// elevation everywhere — local where we have data, AWS everywhere else.
export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ name: string; z: string; x: string; y: string }>;
  }
) {
  const { name, z, x, y } = await params;

  if (
    name.includes("..") ||
    !/^[a-zA-Z0-9._-]+$/.test(name) ||
    !/^\d{1,2}$/.test(z) ||
    !/^\d{1,9}$/.test(x) ||
    !/^\d{1,9}$/.test(y)
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const localPath = join(GIS_DIR, `${name}_tiles`, z, x, `${y}.png`);
  const localBuf = await readFile(localPath).catch(() => null);
  if (localBuf) {
    return new Response(localBuf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Fall back to AWS Terrarium so MapLibre's terrain pipeline still has
  // continuous data outside the locally-imported area.
  const awsRes = await fetch(`${AWS_FALLBACK}/${z}/${x}/${y}.png`);
  if (!awsRes.ok) {
    return new Response("Tile not found", { status: 404 });
  }
  const awsBuf = await awsRes.arrayBuffer();
  return new Response(awsBuf, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
