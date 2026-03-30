import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import { acquireLock, getSession, saveSession, clearSession } from "../src/services/redis";
import { extractExpenseData } from "../src/services/llm";
import { createExpenseRecord } from "../src/services/notion";
import type { ExpenseRecord } from "../src/services/notion";

interface TwilioWebhookBody {
  Body: string;
  From: string;
  MessageSid: string;
  NumMedia: string;
  MediaUrl0?: string;
}

function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildTwimlResponse(message: string): string {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return twiml.toString();
}

function sendTwiml(res: VercelResponse, message: string): void {
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(buildTwimlResponse(message));
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { Body, From, MessageSid, NumMedia, MediaUrl0 } =
      req.body as TwilioWebhookBody;

    const isLocked = await acquireLock(MessageSid);
    if (!isLocked) {
      res.status(200).send("");
      return;
    }

    let userMessage = Body;

    if (parseInt(NumMedia, 10) > 0 && MediaUrl0) {
      console.info(
        `Audio recibido de ${From}, transcripción pendiente. MediaUrl: ${MediaUrl0}`
      );
      if (!userMessage) {
        sendTwiml(
          res,
          "Recibí un audio, pero aún no puedo procesarlos. Por favor envíame tu gasto como texto."
        );
        return;
      }
    }

    if (!userMessage) {
      sendTwiml(res, "No recibí ningún mensaje. ¿Podrías intentar de nuevo?");
      return;
    }

    const previousState = await getSession(From);
    const extraction = await extractExpenseData(userMessage, previousState);

    if (!extraction.is_complete) {
      await saveSession(From, extraction as unknown as Record<string, unknown>);
      sendTwiml(
        res,
        extraction.missing_fields_message ?? "¿Podrías darme más detalles del gasto?"
      );
      return;
    }

    const expenseRecord: ExpenseRecord = {
      concept: extraction.concept!,
      amount: extraction.amount!,
      cardType: extraction.card_type!,
      category: extraction.category!,
      date: formatDateYMD(new Date()),
    };

    const confirmationMessage = await createExpenseRecord(expenseRecord);
    await clearSession(From);

    sendTwiml(res, confirmationMessage);
  } catch (error) {
    console.error("Webhook processing error:", error);
    sendTwiml(res, "Hubo un error procesando tu mensaje, intenta de nuevo.");
  }
}
