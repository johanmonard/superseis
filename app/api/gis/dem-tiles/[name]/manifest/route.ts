import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GIS_DIR = join(process.cwd(), "share", "gis");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (name.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return new Response("Bad name", { status: 400 });
  }
  const buf = await readFile(
    join(GIS_DIR, `${name}_tiles`, "manifest.json")
  ).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(buf, {
    headers: { "Content-Type": "application/json" },
  });
}
