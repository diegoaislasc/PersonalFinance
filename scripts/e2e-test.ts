import { config } from "dotenv";
config();

const BASE_URL = process.env.TEST_URL ?? "http://localhost:3000";

interface TestCase {
  name: string;
  body: Record<string, string>;
  expect: {
    contains?: string[];
    notContains?: string[];
    isEmpty?: boolean;
  };
  delayAfterMs?: number;
}

const SESSION_PHONE_A = "whatsapp:+5218110000001";
const SESSION_PHONE_B = "whatsapp:+5218110000002";
const SESSION_PHONE_C = "whatsapp:+5218110000003";
const SESSION_PHONE_D = "whatsapp:+5218110000004";
const SESSION_PHONE_E = "whatsapp:+5218110000005";
const DUP_SID = `SM_dup_e2e_${Date.now()}`;

const TESTS: TestCase[] = [
  // --- GRUPO 1: Flujo completo en un solo mensaje ---
  {
    name: "G1.1 | Mensaje completo: gasolina con TDC Banorte",
    body: {
      Body: "Pagué 350 de gasolina con la de crédito Banorte",
      From: SESSION_PHONE_A,
      MessageSid: `SM_g1_1_${Date.now()}`,
      NumMedia: "0",
    },
    expect: {
      contains: ["Registrado", "gastos"],
    },
  },
  {
    name: "G1.2 | Mensaje completo: uber con Nu Debito",
    body: {
      Body: "Uber de 89 pesos con la Nu de débito, es transporte",
      From: SESSION_PHONE_B,
      MessageSid: `SM_g1_2_${Date.now()}`,
      NumMedia: "0",
    },
    expect: {
      contains: ["Registrado", "gastos"],
    },
  },

  // --- GRUPO 2: Flujo multi-turno (datos parciales -> completar) ---
  {
    name: "G2.1 | Parcial: solo concepto y monto",
    body: {
      Body: "Compré un café por 65 pesos",
      From: SESSION_PHONE_C,
      MessageSid: `SM_g2_1_${Date.now()}`,
      NumMedia: "0",
    },
    expect: {
      contains: ["Message"],
      notContains: ["Registrado"],
    },
    delayAfterMs: 2000,
  },
  {
    name: "G2.2 | Seguimiento: completa tarjeta",
    body: {
      Body: "Con la TDC Nu",
      From: SESSION_PHONE_C,
      MessageSid: `SM_g2_2_${Date.now()}`,
      NumMedia: "0",
    },
    expect: {
      contains: ["Registrado", "gastos"],
    },
  },

  // --- GRUPO 3: Idempotencia ---
  {
    name: "G3.1 | Primer envío (debe procesar)",
    body: {
      Body: "Pagué Netflix 199 con TDC Nu, es entretenimiento",
      From: SESSION_PHONE_D,
      MessageSid: DUP_SID,
      NumMedia: "0",
    },
    expect: {
      contains: ["Message"],
    },
  },
  {
    name: "G3.2 | Reenvío mismo SID (debe ignorar)",
    body: {
      Body: "Pagué Netflix 199 con TDC Nu, es entretenimiento",
      From: SESSION_PHONE_D,
      MessageSid: DUP_SID,
      NumMedia: "0",
    },
    expect: {
      isEmpty: true,
    },
  },

  // --- GRUPO 4: Edge cases ---
  {
    name: "G4.1 | Audio sin texto -> pide texto",
    body: {
      Body: "",
      From: SESSION_PHONE_E,
      MessageSid: `SM_g4_1_${Date.now()}`,
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/fake-audio.ogg",
    },
    expect: {
      contains: ["audio", "texto"],
    },
  },
  {
    name: "G4.2 | Mensaje vacío -> pide reintento",
    body: {
      Body: "",
      From: SESSION_PHONE_E,
      MessageSid: `SM_g4_2_${Date.now()}`,
      NumMedia: "0",
    },
    expect: {
      contains: ["intentar de nuevo"],
    },
  },
  {
    name: "G4.3 | Método GET rechazado",
    body: { _method: "GET" } as Record<string, string>,
    expect: {
      contains: ["not allowed"],
    },
  },
];

function toUrlEncoded(obj: Record<string, string>): string {
  return Object.entries(obj)
    .filter(([k]) => k !== "_method")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function extractTwimlMessage(xml: string): string {
  const match = xml.match(/<Message>([\s\S]*?)<\/Message>/);
  return match?.[1]?.trim() ?? "(no message)";
}

async function sendRequest(
  tc: TestCase
): Promise<{ status: number; text: string }> {
  const method = tc.body._method ?? "POST";
  const url = `${BASE_URL}/api/webhook`;

  if (method === "GET") {
    const res = await fetch(url, { method: "GET" });
    return { status: res.status, text: await res.text() };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: toUrlEncoded(tc.body),
  });
  return { status: res.status, text: await res.text() };
}

async function runTest(
  tc: TestCase,
  index: number,
  total: number
): Promise<boolean> {
  const label = `[${String(index + 1).padStart(2, " ")}/${total}] ${tc.name}`;
  const start = Date.now();

  try {
    const { status, text } = await sendRequest(tc);
    const elapsed = Date.now() - start;
    const lower = text.toLowerCase();

    let pass = true;
    const reasons: string[] = [];

    if (tc.expect.contains) {
      for (const kw of tc.expect.contains) {
        if (!lower.includes(kw.toLowerCase())) {
          pass = false;
          reasons.push(`missing "${kw}"`);
        }
      }
    }

    if (tc.expect.notContains) {
      for (const kw of tc.expect.notContains) {
        if (lower.includes(kw.toLowerCase())) {
          pass = false;
          reasons.push(`unexpected "${kw}"`);
        }
      }
    }

    if (tc.expect.isEmpty && text.trim() !== "") {
      pass = false;
      reasons.push(`expected empty, got: ${text.substring(0, 80)}`);
    }

    const statusIcon = pass ? "  PASS" : "  FAIL";
    console.log(`${statusIcon}  ${label}  (${elapsed}ms)`);

    if (text.includes("<Message>")) {
      console.log(`        -> "${extractTwimlMessage(text)}"`);
    } else if (text.trim() && !tc.expect.isEmpty) {
      console.log(`        -> ${text.substring(0, 120)}`);
    }

    if (!pass) {
      reasons.forEach((r) => console.log(`        REASON: ${r}`));
    }

    return pass;
  } catch (err) {
    console.log(`  ERR   ${label}`);
    console.log(`        ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  console.log("");
  console.log("=".repeat(70));
  console.log("  FINANCE BOT - E2E Test Suite (Real APIs)");
  console.log(`  Target: ${BASE_URL}/api/webhook`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("=".repeat(70));
  console.log("");

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const tc = TESTS[i];
    const ok = await runTest(tc, i, TESTS.length);
    if (ok) passed++;
    else failed++;

    const delay = tc.delayAfterMs ?? 1000;
    if (i < TESTS.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.log("");
  console.log("=".repeat(70));
  const icon = failed === 0 ? "ALL PASSED" : `${failed} FAILED`;
  console.log(`  Results: ${passed} passed, ${failed} failed (${icon})`);
  console.log("=".repeat(70));
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main();
