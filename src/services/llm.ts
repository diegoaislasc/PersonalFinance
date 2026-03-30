import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const VALID_CARD_TYPES = [
  "TDC Banorte",
  "TDC Nu",
  "Banorte Debito",
  "Nu Debito",
] as const;

const VALID_CATEGORIES = [
  "Eating out & Takeout",
  "Transport",
  "Bills & Utilities",
  "Entertainments",
] as const;

export interface ExpenseExtraction {
  is_complete: boolean;
  concept: string | null;
  amount: number | null;
  card_type: string | null;
  category: string | null;
  missing_fields_message: string | null;
}

const EXPENSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_complete: {
      type: Type.BOOLEAN,
      description:
        "true only when concept, amount, card_type, and category all have non-null values",
    },
    concept: {
      type: Type.STRING,
      nullable: true,
      description: 'Short expense concept, e.g. "Gasolina", "Papitas"',
    },
    amount: {
      type: Type.NUMBER,
      nullable: true,
      description: "Numeric amount of the expense",
    },
    card_type: {
      type: Type.STRING,
      nullable: true,
      description: `Payment method. Must be one of: ${VALID_CARD_TYPES.join(", ")}`,
      enum: [...VALID_CARD_TYPES],
    },
    category: {
      type: Type.STRING,
      nullable: true,
      description: `Expense category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      enum: [...VALID_CATEGORIES],
    },
    missing_fields_message: {
      type: Type.STRING,
      nullable: true,
      description:
        "Friendly question in Spanish asking the user for missing fields. null when is_complete is true",
    },
  },
  required: [
    "is_complete",
    "concept",
    "amount",
    "card_type",
    "category",
    "missing_fields_message",
  ],
} as const;

function getMonthName(date: Date): string {
  return date.toLocaleString("en-US", { month: "long" });
}

function buildSystemPrompt(
  currentDate: string,
  monthName: string,
  previousState: Record<string, unknown> | null
): string {
  const previousContext = previousState
    ? `\nThe user already provided some data in a previous message. Here is the partial state so far:\n${JSON.stringify(previousState)}\nMerge the new message data with this existing state. Keep existing non-null values unless the new message explicitly overrides them.`
    : "";

  return `You are an expert financial assistant that extracts expense data from user messages written in Spanish.

CURRENT SYSTEM DATE: ${currentDate}
CURRENT MONTH: ${monthName}

VALID PAYMENT METHODS (card_type):
- TDC Banorte (Tarjeta de Crédito Banorte)
- TDC Nu (Tarjeta de Crédito Nu)
- Banorte Debito (Tarjeta de Débito Banorte)
- Nu Debito (Tarjeta de Débito Nu)

VALID CATEGORIES:
- Eating out & Takeout (comida fuera de casa, restaurantes, snacks, bebidas, cafés)
- Transport (gasolina, uber, taxi, transporte público, estacionamiento)
- Bills & Utilities (servicios, luz, agua, gas, internet, teléfono, suscripciones)
- Entertainments (cine, videojuegos, conciertos, eventos, streaming fuera de suscripciones fijas)

RULES:
1. Extract concept, amount, card_type, and category from the user message.
2. Infer the category from context when obvious (e.g. "gasolina" → Transport, "papitas" → Eating out & Takeout).
3. If any of the 4 fields (concept, amount, card_type, category) is missing or cannot be determined, set is_complete to false and write a short, friendly question in Spanish in missing_fields_message asking for ONLY the missing fields.
4. If ALL 4 fields have values, set is_complete to true and missing_fields_message to null.
5. Normalize the concept to a clean short label (capitalize first letter).
6. When the user mentions "crédito Banorte" or "la de crédito Banorte", map to "TDC Banorte". Apply similar logic for other card references.
7. Amounts should be numeric only, no currency symbols.
${previousContext}`;
}

export async function extractExpenseData(
  userMessage: string,
  previousState: Record<string, unknown> | null
): Promise<ExpenseExtraction> {
  const now = new Date();
  const currentDate = now.toISOString();
  const monthName = getMonthName(now);

  const systemPrompt = buildSystemPrompt(currentDate, monthName, previousState);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: EXPENSE_SCHEMA,
    },
  });

  const parsed: ExpenseExtraction = JSON.parse(response.text ?? "{}");

  return parsed;
}
