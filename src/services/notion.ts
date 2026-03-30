import { Client, APIResponseError } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const MONTH_DATABASE_IDS: Record<string, string> = {
  January: process.env.NOTION_DB_JANUARY!,
  February: process.env.NOTION_DB_FEBRUARY!,
  March: process.env.NOTION_DB_MARCH!,
  April: process.env.NOTION_DB_APRIL!,
  May: process.env.NOTION_DB_MAY!,
  June: process.env.NOTION_DB_JUNE!,
  July: process.env.NOTION_DB_JULY!,
  August: process.env.NOTION_DB_AUGUST!,
  September: process.env.NOTION_DB_SEPTEMBER!,
  October: process.env.NOTION_DB_OCTOBER!,
  November: process.env.NOTION_DB_NOVEMBER!,
  December: process.env.NOTION_DB_DECEMBER!,
};

const CATEGORY_IDS: Record<string, string> = {
  "Eating out & Takeout": process.env.NOTION_CAT_EATING_OUT!,
  Transport: process.env.NOTION_CAT_TRANSPORT!,
  "Bills & Utilities": process.env.NOTION_CAT_BILLS!,
  Entertainments: process.env.NOTION_CAT_ENTERTAINMENTS!,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function getCurrentMonth(): string {
  return MONTH_NAMES[new Date().getMonth()];
}

export function getDatabaseIdForCurrentMonth(): string {
  const month = getCurrentMonth();
  const databaseId = MONTH_DATABASE_IDS[month];
  if (!databaseId) {
    throw new Error(
      `No Notion database ID configured for month: ${month}. Set NOTION_DB_${month.toUpperCase()} in your environment.`
    );
  }
  return databaseId;
}

export interface ExpenseRecord {
  concept: string;
  amount: number;
  cardType: string;
  category: string;
  date: string;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimited =
        error instanceof APIResponseError && error.status === 429;

      if (!isRateLimited || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = Math.pow(2, attempt - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("withRetry: unreachable");
}

export async function createExpenseRecord(
  data: ExpenseRecord
): Promise<string> {
  const month = getCurrentMonth();
  const databaseId = getDatabaseIdForCurrentMonth();

  const categoryId = CATEGORY_IDS[data.category];
  if (!categoryId) {
    throw new Error(
      `Unknown category: "${data.category}". Valid options: ${Object.keys(CATEGORY_IDS).join(", ")}`
    );
  }

  await withRetry(() =>
    notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: data.concept } }] },
        Amount: { number: data.amount },
        "Card Type": { select: { name: data.cardType } },
        Category: { relation: [{ id: categoryId }] },
        Date: { date: { start: data.date } },
      },
    })
  );

  return `Registrado en los gastos de ${month}.`;
}
