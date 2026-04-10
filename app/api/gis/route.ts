import { readdir } from "node:fs/promises";
import { join } from "node:path";

const GIS_DIR = join(process.cwd(), "share", "gis");

export async function GET() {
  const entries = await readdir(GIS_DIR).catch(() => [] as string[]);
  const files = entries.filter((f) => f.endsWith(".gpkg"));
  return Response.json({ files });
}
