import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';

const DEFAULT_TTL_SECONDS = 86_400; // 24 ч

/** Бакет округления exp (#150): подпись детерминирована в пределах часа —
 *  рефечи ленты и ws-инвалидации выдают ТОТ ЖЕ URL файла, поэтому кэш
 *  браузера (max-age=3600 + ETag) попадает и картинки не перезагружаются
 *  на каждый перевыпуск DTO. Без бакета новые exp/sig на каждом рефече
 *  меняли src всех <img> — лента «моргала». */
const EXP_BUCKET_SECONDS = 3_600;

/**
 * Подпись ссылок отдачи файлов (ADR-0013): GET /files/:id/content открывается
 * из <img>/«скачать»/новой вкладки, которые не умеют Authorization-заголовок.
 * HMAC-SHA256(`${id}:${exp}`) c STORAGE_URL_SECRET — короткая виза на просмотр:
 * права проверены при выдаче ссылки (лента сообщений требует членства),
 * подпись не является учётной записью и не даёт ничего, кроме этого файла.
 * TTL 24 ч: кэш браузера живёт сутки, рефечи ленты перевыпускают ссылки.
 */
@Injectable()
export class SignedUrlService {
  private readonly secret: string;
  private readonly ttlSeconds: number;

  /**
   * @Optional: параметр НЕ для DI (Nest иначе попытается его резолвить) —
   * значение подставляется дефолтом; тесты передают своё окружение явно.
   */
  constructor(@Optional() env: NodeJS.ProcessEnv = process.env) {
    const secret = env.STORAGE_URL_SECRET;
    if (!secret || secret.length < 32) {
      // Дублирует validateEnv для тестов, где сервис создаётся напрямую.
      throw new Error('STORAGE_URL_SECRET не задан (минимум 32 символа)');
    }
    this.secret = secret;
    const ttl = Number(env.STORAGE_URL_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
    this.ttlSeconds = Number.isFinite(ttl) && ttl >= 60 ? ttl : DEFAULT_TTL_SECONDS;
  }

  /** Относительный URL контента файла для DTO вложений (same-origin — без CORS). */
  fileContentUrl(fileId: string): string {
    const { exp, sig } = this.sign(fileId);
    return `/api/v1/files/${fileId}/content?exp=${exp}&sig=${sig}`;
  }

  /** URL КОНКРЕТНОЙ версии (history просмотрщика, #138): ресурс подписи —
   * `${fileId}:v{N}`, поэтому старые ссылки не открывают новый контент. */
  fileVersionUrl(fileId: string, version: number): string {
    const { exp, sig } = this.sign(`${fileId}:v${version}`);
    return `/api/v1/files/${fileId}/content?v=${version}&exp=${exp}&sig=${sig}`;
  }

  /** URL производной файла (конвейер #139): подпись детерминирована от
   * (fileId, kind) — ссылка выдаётся в DTO без похода в БД; неготовая
   * производная отвечает 404 по этой же ссылке. */
  fileDerivativeUrl(fileId: string, kind: 'pdf'): string {
    const { exp, sig } = this.sign(`${fileId}:deriv:${kind}`);
    return `/api/v1/files/${fileId}/derivative/${kind}?exp=${exp}&sig=${sig}`;
  }

  sign(resourceId: string): { exp: number; sig: string } {
    // Округление ВВЕРХ до часового бакета: все вызовы в пределах часа дают
    // один и тот же exp → одна и та же подпись → один и тот же URL. Реальное
    // время жизни ссылки — от ttl до ttl+бакет (до 25 ч), verify не меняется.
    const exp =
      Math.ceil((Date.now() / 1000 + this.ttlSeconds) / EXP_BUCKET_SECONDS) * EXP_BUCKET_SECONDS;
    return { exp, sig: this.hmac(resourceId, exp) };
  }

  /** Подпись валидна и не истекла (сравнение константное по времени). */
  verify(resourceId: string, exp: number, sig: string): boolean {
    if (!Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return false;
    }
    if (!/^[0-9a-f]{64}$/.test(sig)) return false;
    const expected = Buffer.from(this.hmac(resourceId, exp), 'hex');
    const given = Buffer.from(sig, 'hex');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private hmac(resourceId: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${resourceId}:${exp}`).digest('hex');
  }
}
