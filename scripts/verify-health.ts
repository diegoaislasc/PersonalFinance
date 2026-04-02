/**
 * Smoke test: invoca el handler de /api/health sin levantar servidor (adecuado para CI).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/health";

function createMocks(method: string) {
  const req = {
    method,
    headers: {},
    body: {},
    query: {},
  } as VercelRequest;

  let statusCode = 200;
  let jsonPayload: unknown;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      jsonPayload = data;
    },
  } as unknown as VercelResponse;

  return { req, res, getStatus: () => statusCode, getJson: () => jsonPayload };
}

async function main() {
  const get = createMocks("GET");
  await handler(get.req, get.res);
  const body = get.getJson() as Record<string, unknown>;
  if (get.getStatus() !== 200 || body?.ok !== true || typeof body?.service !== "string") {
    console.error("verify-health: GET /api/health failed", {
      status: get.getStatus(),
      body,
    });
    process.exit(1);
  }

  const post = createMocks("POST");
  await handler(post.req, post.res);
  if (post.getStatus() !== 405) {
    console.error("verify-health: expected 405 for POST", post.getStatus());
    process.exit(1);
  }

  console.log("verify-health: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
