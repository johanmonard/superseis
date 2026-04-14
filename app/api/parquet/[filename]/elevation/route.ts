import { join } from "node:path";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const PARQUET_DIR = join(process.cwd(), "share", "parquet");
const SCRIPT_PATH = join(process.cwd(), "scripts", "add-elevation.py");

function safePath(filename: string): string | null {
  if (filename.includes("..") || !filename.endsWith(".parquet")) return null;
  return join(PARQUET_DIR, filename);
}

// GET /api/parquet/[filename]/elevation
// Streams Server-Sent Events with progress from the Python script.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const filePath = safePath(filename);
  if (!filePath) return new Response("Bad filename", { status: 400 });

  try {
    await access(filePath);
  } catch {
    return new Response("File not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const proc = spawn("python3", [SCRIPT_PATH, filePath, "--zoom", "12"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) send(trimmed);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) {
          send(JSON.stringify({ stage: "error", progress: 0, message: msg }));
        }
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          send(JSON.stringify({ stage: "error", progress: 0, message: `Process exited with code ${code}` }));
        }
        send(JSON.stringify({ stage: "closed", progress: 1, message: "" }));
        controller.close();
      });

      proc.on("error", (err) => {
        send(JSON.stringify({ stage: "error", progress: 0, message: err.message }));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
