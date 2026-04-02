import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const dir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(dir, "../package.json"), "utf8")
) as { name: string; version: string };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  console.info("[api:health] ok");
  res.status(200).json({
    ok: true,
    service: pkg.name,
    version: pkg.version,
  });
}
