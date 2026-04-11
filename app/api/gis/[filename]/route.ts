import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const GIS_DIR = join(process.cwd(), "share", "gis");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  const isAllowed =
    filename.endsWith(".gpkg") || filename.endsWith(".tif");
  if (!isAllowed || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const buf = await readFile(join(GIS_DIR, filename)).catch(() => null);
  if (!buf) return new Response("Not found", { status: 404 });

  return new Response(buf, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  if (!filename.endsWith(".gpkg") || filename.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  await writeFile(join(GIS_DIR, filename), buf);

  return Response.json({ ok: true });
}
