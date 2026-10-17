/**
 * Изоляция Redis интеграционных тестов (#332). Корневой `.env` на машине
 * разработки указывает на Redis живого стека (db0): тестовое приложение
 * писало бы доменные события в боевой стрим (их читает живой gateway) и
 * делило бы очереди BullMQ с живым api — воровство задач в обе стороны
 * (тот же механизм, что у песочницы: nodus-dev-testing). Тест-контур всегда
 * уходит в собственный db, независимо от того, что пришло в env.
 */
export const INTEGRATION_TEST_REDIS_DB = 15;
/** Бакет объектного хранилища тест-контура (#324): тот же MinIO, свой бакет —
 *  файлы тестов не оседают в бакете живого стека (api создаёт бакет сам). */
export const INTEGRATION_TEST_BUCKET = 'nodus-test-files';

/** Тот же Redis-сервер, но db тест-контура. */
export function isolatedTestRedisUrl(url) {
  const parsed = new URL(url);
  parsed.pathname = `/${INTEGRATION_TEST_REDIS_DB}`;
  return parsed.toString();
}

/** Переписывает `process.env.REDIS_URL` (если задан) на db тест-контура и
 *  бакет хранилища — на бакет тест-контура. */
export function isolateIntegrationRedis() {
  if (process.env.REDIS_URL) {
    process.env.REDIS_URL = isolatedTestRedisUrl(process.env.REDIS_URL);
  }
  process.env.STORAGE_BUCKET = INTEGRATION_TEST_BUCKET;
}

/** Громкий отказ, если тест-контур всё-таки смотрит в чужой Redis db
 *  (конфиг без `isolateIntegrationRedis`, ручной запуск с env). */
export function assertIsolatedTestRedis() {
  const url = process.env.REDIS_URL;
  if (url && new URL(url).pathname !== `/${INTEGRATION_TEST_REDIS_DB}`) {
    throw new Error(
      `REDIS_URL указывает не на db ${INTEGRATION_TEST_REDIS_DB} тест-контура — интеграционный тест писал бы в Redis живого стека (#332)`,
    );
  }
  if (process.env.STORAGE_BUCKET && process.env.STORAGE_BUCKET !== INTEGRATION_TEST_BUCKET) {
    throw new Error(
      `STORAGE_BUCKET не ${INTEGRATION_TEST_BUCKET} — интеграционный тест писал бы файлы в бакет живого стека (#324)`,
    );
  }
}
