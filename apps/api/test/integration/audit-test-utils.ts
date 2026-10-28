import { vi } from 'vitest';

/**
 * Аудит пишется **fire-and-forget** после успешного ответа API
 * (`AuditInterceptor`, I7): запись в `audit_logs` появляется чуть позже
 * HTTP-ответа. Чтение сразу после ответа — гонка и флак в CI (#520).
 * Ждём первую подходящую запись поллингом, не меняя продукт.
 *
 * ```ts
 * const audit = await waitForAudit(() =>
 *   prisma.auditLog.findFirst({ where: { action: 'custom_field.bind' } }),
 * );
 * ```
 */
export async function waitForAudit<T>(
  find: () => Promise<T | null>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  let found: T | null = null;
  await vi.waitFor(
    async () => {
      found = await find();
      if (found === null) throw new Error('аудит ещё не записан');
    },
    { timeout: options.timeout ?? 5_000, interval: options.interval ?? 50 },
  );
  return found as T;
}
