import http from "node:http";
import { parse } from "node:querystring";

const PORT = 3001;

const mockExtraction = {
  complete: {
    is_complete: true,
    concept: "Gasolina",
    amount: 350,
    card_type: "TDC Banorte",
    category: "Transport",
    missing_fields_message: null,
  },
  partial: {
    is_complete: false,
    concept: "Papitas",
    amount: 30,
    card_type: null,
    category: null,
    missing_fields_message:
      "¿Con qué tarjeta pagaste las papitas y en qué categoría lo registro?",
  },
};

let requestCount = 0;
let sessionStore: Record<string, unknown> | null = null;
const processedMessages = new Set<string>();

function createMockModules() {
  const redisModule = {
    async saveSession(_phone: string, data: Record<string, unknown>) {
      sessionStore = data;
      console.log("  [REDIS] Session saved:", JSON.stringify(data).substring(0, 80));
    },
    async getSession(_phone: string) {
      console.log("  [REDIS] Session retrieved:", sessionStore ? "found" : "null");
      return sessionStore;
    },
    async clearSession(_phone: string) {
      sessionStore = null;
      console.log("  [REDIS] Session cleared");
    },
    async acquireLock(messageId: string) {
      if (processedMessages.has(messageId)) {
        console.log("  [REDIS] Lock DENIED (duplicate):", messageId);
        return false;
      }
      processedMessages.add(messageId);
      console.log("  [REDIS] Lock ACQUIRED:", messageId);
      return true;
    },
  };

  return { redisModule };
}

function buildTwimlResponse(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

async function handleWebhook(
  body: Record<string, string | undefined>,
  redis: ReturnType<typeof createMockModules>["redisModule"]
): Promise<{ status: number; contentType: string; body: string }> {
  const { Body, From, MessageSid, NumMedia, MediaUrl0 } = body;

  if (!MessageSid || !From) {
    return { status: 400, contentType: "application/json", body: '{"error":"Missing fields"}' };
  }

  const isLocked = await redis.acquireLock(MessageSid);
  if (!isLocked) {
    return { status: 200, contentType: "text/plain", body: "" };
  }

  let userMessage = Body ?? "";

  if (parseInt(NumMedia ?? "0", 10) > 0 && MediaUrl0) {
    console.log(`  [AUDIO] Received media from ${From}: ${MediaUrl0}`);
    if (!userMessage) {
      return {
        status: 200,
        contentType: "text/xml",
        body: buildTwimlResponse(
          "Recibí un audio, pero aún no puedo procesarlos. Por favor envíame tu gasto como texto."
        ),
      };
    }
  }

  if (!userMessage) {
    return {
      status: 200,
      contentType: "text/xml",
      body: buildTwimlResponse("No recibí ningún mensaje. ¿Podrías intentar de nuevo?"),
    };
  }

  const previousState = await redis.getSession(From);

  requestCount++;
  const isFollowUp = previousState !== null;
  const extraction = isFollowUp ? mockExtraction.complete : mockExtraction.partial;

  console.log(`  [LLM]   Extraction -> is_complete: ${extraction.is_complete}`);

  if (!extraction.is_complete) {
    await redis.saveSession(From, extraction as unknown as Record<string, unknown>);
    return {
      status: 200,
      contentType: "text/xml",
      body: buildTwimlResponse(extraction.missing_fields_message!),
    };
  }

  const month = new Date().toLocaleString("en-US", { month: "long" });
  console.log(`  [NOTION] Would create record in "${month}" database`);
  console.log(`           -> ${extraction.concept}: $${extraction.amount} (${extraction.card_type})`);

  await redis.clearSession(From);

  return {
    status: 200,
    contentType: "text/xml",
    body: buildTwimlResponse(`Registrado en los gastos de ${month}.`),
  };
}

interface TestCase {
  name: string;
  body: Record<string, string>;
  expect: {
    status: number;
    contains?: string[];
    empty?: boolean;
  };
}

const TESTS: TestCase[] = [
  {
    name: "1. Mensaje parcial -> pide datos faltantes",
    body: {
      Body: "Compré unas papitas por 30 pesos",
      From: "whatsapp:+5218111234567",
      MessageSid: "SM_smoke_1",
      NumMedia: "0",
    },
    expect: { status: 200, contains: ["tarjeta", "categoría"] },
  },
  {
    name: "2. Seguimiento -> registro completo",
    body: {
      Body: "Con la de crédito Banorte, Transport",
      From: "whatsapp:+5218111234567",
      MessageSid: "SM_smoke_2",
      NumMedia: "0",
    },
    expect: { status: 200, contains: ["Registrado", "gastos"] },
  },
  {
    name: "3. Idempotencia -> duplicado ignorado",
    body: {
      Body: "Compré café por 80",
      From: "whatsapp:+5218112222222",
      MessageSid: "SM_smoke_dup",
      NumMedia: "0",
    },
    expect: { status: 200 },
  },
  {
    name: "4. Mismo MessageSid -> respuesta vacía",
    body: {
      Body: "Compré café por 80",
      From: "whatsapp:+5218112222222",
      MessageSid: "SM_smoke_dup",
      NumMedia: "0",
    },
    expect: { status: 200, empty: true },
  },
  {
    name: "5. Audio sin texto -> pide texto",
    body: {
      Body: "",
      From: "whatsapp:+5218113333333",
      MessageSid: "SM_smoke_audio",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/fake.ogg",
    },
    expect: { status: 200, contains: ["audio", "texto"] },
  },
  {
    name: "6. Mensaje vacío -> pide reintento",
    body: {
      Body: "",
      From: "whatsapp:+5218114444444",
      MessageSid: "SM_smoke_empty",
      NumMedia: "0",
    },
    expect: { status: 200, contains: ["intentar de nuevo"] },
  },
];

function toUrlEncoded(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function sendRequest(body: Record<string, string>): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const data = toUrlEncoded(body);
    const req = http.request(
      { hostname: "localhost", port: PORT, path: "/api/webhook", method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 500, text: Buffer.concat(chunks).toString() }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const { redisModule } = createMockModules();

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const parsed = parse(Buffer.concat(chunks).toString()) as Record<string, string>;

    const result = await handleWebhook(parsed, redisModule);
    res.writeHead(result.status, { "Content-Type": result.contentType });
    res.end(result.body);
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`\n  Smoke Test Server running on port ${PORT}\n`);
  console.log("=".repeat(60));

  let passed = 0;
  let failed = 0;

  for (const tc of TESTS) {
    console.log(`\n  TEST: ${tc.name}`);
    console.log("-".repeat(60));

    const { status, text } = await sendRequest(tc.body);

    let ok = status === tc.expect.status;

    if (tc.expect.contains) {
      const allFound = tc.expect.contains.every((kw) => text.toLowerCase().includes(kw.toLowerCase()));
      if (!allFound) ok = false;
    }

    if (tc.expect.empty && text.trim() !== "") {
      ok = false;
    }

    if (ok) {
      console.log(`  -> PASS (status: ${status})`);
      passed++;
    } else {
      console.log(`  -> FAIL (status: ${status})`);
      console.log(`     Response: ${text.substring(0, 200)}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n  Results: ${passed} passed, ${failed} failed, ${TESTS.length} total\n`);

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main();
