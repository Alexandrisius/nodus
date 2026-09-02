import { ApiHeader } from '@nestjs/swagger';

/**
 * Заголовок идемпотентности мутации (I7, ADR-0005, api-conventions.md).
 * Клиент генерирует ключ сам; повтор с тем же ключом и телом вернёт первый ответ.
 * Необязателен: без заголовка механизм просто не применяется (см. IdempotencyInterceptor).
 */
export const ApiIdempotencyKey = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Ключ идемпотентности (генерируется клиентом). Повтор с тем же ключом и телом вернёт первый результат.',
    schema: { type: 'string', minLength: 1, maxLength: 128 },
  });
