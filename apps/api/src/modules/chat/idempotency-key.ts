import type { FastifyRequest } from 'fastify';

/**
 * Чтение Idempotency-Key POST-отправок чата (клиент ставит на каждый POST;
 * иначе — сервер сгенерирует). Значение становится clientMessageId сообщения
 * (копии пересылки — с суффиксом «:i»/«:c») и транслируется всем участникам
 * в DTO/WS (#243) — принимаем только короткие ключи: длинный или мусорный
 * заголовок игнорируем, сервис сгенерирует свой. Мягче reject: ретраи
 * старых/чужих клиентов не ломаются. Лимит 1–128 (с суффиксами ≤ 130 <
 * .max(160) messageSchema).
 */
export function readIdempotencyKey(request: FastifyRequest): string | undefined {
  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key) return undefined;
  return key.length >= 1 && key.length <= 128 ? key : undefined;
}
