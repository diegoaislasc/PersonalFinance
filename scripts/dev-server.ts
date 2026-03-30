import http from "node:http";
import { parse } from "node:querystring";
import { config } from "dotenv";

config();

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function loadHandler() {
  const mod = await import("../api/webhook");
  return mod.default;
}

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/api/webhook")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const rawBody = Buffer.concat(chunks).toString();
  const parsedBody = parse(rawBody);

  const vercelReq = {
    method: req.method,
    headers: req.headers,
    body: parsedBody,
    query: {},
  };

  const headersSent: Record<string, string> = {};
  let statusCode = 200;
  let responseBody = "";

  const vercelRes = {
    setHeader(key: string, value: string) {
      headersSent[key] = value;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(body: string) {
      responseBody = body;
      res.writeHead(statusCode, headersSent);
      res.end(responseBody);
      return this;
    },
    json(data: unknown) {
      headersSent["Content-Type"] = "application/json";
      responseBody = JSON.stringify(data);
      res.writeHead(statusCode, headersSent);
      res.end(responseBody);
      return this;
    },
  };

  try {
    const handler = await loadHandler();
    await handler(vercelReq, vercelRes);
  } catch (err) {
    console.error("Handler error:", err);
    if (!res.writableEnded) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  Dev server running at http://localhost:${PORT}`);
  console.log(`  Webhook endpoint: http://localhost:${PORT}/api/webhook\n`);
});
