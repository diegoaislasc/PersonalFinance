import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const SESSION_PREFIX = "finance_session:";
const LOCK_PREFIX = "idempotency_lock:";
const SESSION_TTL_SECONDS = 3600;
const LOCK_TTL_SECONDS = 300;

export async function saveSession(
  phone: string,
  data: Record<string, unknown>
): Promise<void> {
  await redis.set(`${SESSION_PREFIX}${phone}`, data, {
    ex: SESSION_TTL_SECONDS,
  });
}

export async function getSession(
  phone: string
): Promise<Record<string, unknown> | null> {
  return await redis.get<Record<string, unknown>>(
    `${SESSION_PREFIX}${phone}`
  );
}

export async function clearSession(phone: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${phone}`);
}

export async function acquireLock(messageId: string): Promise<boolean> {
  const result = await redis.set(`${LOCK_PREFIX}${messageId}`, 1, {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });
  return result === "OK";
}
