import { readdir } from "node:fs/promises";
import { join } from "node:path";

const PARQUET_DIR = join(process.cwd(), "share", "parquet");

export async function GET() {
  const entries = await readdir(PARQUET_DIR).catch(() => [] as string[]);
  const files = entries.filter((f) => f.endsWith(".parquet"));
  return Response.json({ files });
}
