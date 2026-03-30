const BASE_URL = process.env.TEST_URL ?? "http://localhost:3000";

interface TestCase {
  name: string;
  body: Record<string, string>;
  expectContains: string[];
}

const TEST_CASES: TestCase[] = [
  {
    name: "Mensaje completo (todos los campos)",
    body: {
      Body: "Pagué 350 de gasolina con la de crédito Banorte",
      From: "whatsapp:+5218111234567",
      MessageSid: `SM_test_complete_${Date.now()}`,
      NumMedia: "0",
    },
    expectContains: ["Registrado", "gastos"],
  },
  {
    name: "Mensaje parcial (falta tarjeta y categoría)",
    body: {
      Body: "Compré unas papitas por 30 pesos",
      From: "whatsapp:+5218119999999",
      MessageSid: `SM_test_partial_${Date.now()}`,
      NumMedia: "0",
    },
    expectContains: ["Message"],
  },
  {
    name: "Seguimiento de conversación (completa datos faltantes)",
    body: {
      Body: "Con la Nu de débito, ponlo en Eating out",
      From: "whatsapp:+5218119999999",
      MessageSid: `SM_test_followup_${Date.now()}`,
      NumMedia: "0",
    },
    expectContains: ["Message"],
  },
  {
    name: "Mensaje duplicado (idempotencia)",
    body: {
      Body: "Pagué 100 de uber con Nu débito",
      From: "whatsapp:+5218112222222",
      MessageSid: "SM_test_duplicate_fixed",
      NumMedia: "0",
    },
    expectContains: [],
  },
  {
    name: "Reintento del mismo MessageSid (debe ignorar)",
    body: {
      Body: "Pagué 100 de uber con Nu débito",
      From: "whatsapp:+5218112222222",
      MessageSid: "SM_test_duplicate_fixed",
      NumMedia: "0",
    },
    expectContains: [],
  },
  {
    name: "Audio sin texto (fallback message)",
    body: {
      Body: "",
      From: "whatsapp:+5218113333333",
      MessageSid: `SM_test_audio_${Date.now()}`,
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/fake-audio.ogg",
    },
    expectContains: ["audio", "texto"],
  },
];

function toUrlEncoded(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function runTest(tc: TestCase, index: number): Promise<boolean> {
  const label = `[${index + 1}/${TEST_CASES.length}] ${tc.name}`;
  try {
    const response = await fetch(`${BASE_URL}/api/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toUrlEncoded(tc.body),
    });

    const text = await response.text();
    const status = response.status;

    const allExpected = tc.expectContains.every((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase())
    );

    if (status === 200 && allExpected) {
      console.log(`  PASS  ${label}`);
      if (text.trim()) {
        const msgMatch = text.match(/<Message>(.*?)<\/Message>/s);
        console.log(`        Response: ${msgMatch?.[1]?.trim() ?? "(empty)"}`);
      }
      return true;
    } else {
      console.log(`  FAIL  ${label}`);
      console.log(`        Status: ${status}`);
      console.log(`        Body: ${text.substring(0, 300)}`);
      return false;
    }
  } catch (error) {
    console.log(`  ERROR ${label}`);
    console.log(`        ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

async function main() {
  console.log(`\nFinance Bot - Webhook Test Suite`);
  console.log(`Target: ${BASE_URL}/api/webhook\n`);
  console.log("─".repeat(60));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < TEST_CASES.length; i++) {
    const ok = await runTest(TEST_CASES[i], i);
    if (ok) passed++;
    else failed++;

    if (i < TEST_CASES.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log("─".repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${TEST_CASES.length} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
