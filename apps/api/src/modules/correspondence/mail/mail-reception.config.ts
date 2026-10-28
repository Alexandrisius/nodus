import { Injectable, type InjectionToken } from '@nestjs/common';

/**
 * Конфиг подсистемы приёма почты (#56, ADR-0035): все переменные optional —
 * секреты живут только в .env владельца/песочницы, в .env.example — имена без
 * значений. `armed` = рубильник mail-reception (перепроверяется каждый цикл)
 * И заполненные обязательные IMAP-поля: без соединения приём не включается,
 * даже если флаг включён. SMTP-часть вооружается независимо.
 */
export interface MailImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface MailSmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** Токен внедрения: у конфига параметр конструктора (env для тестов) —
 *  фабрика в модуле, чтобы Nest не пытался внедрять сам env. */
export const MAIL_RECEPTION_CONFIG: InjectionToken = 'MAIL_RECEPTION_CONFIG';

/** dotenv-семантика: окружающие кавычки — разделители, а не часть значения.
 *  Живой контур 28.10: пароль в `.env` записан в кавычках, и сырое значение
 *  уходило в AUTHENTICATE PLAIN → «Authentication failed» (песочница
 *  передаёт env строками, без разбора dotenv). */
function unquote(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 2) return trimmed;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

@Injectable()
export class MailReceptionConfig {
  readonly imap: MailImapConfig | null;
  readonly smtp: MailSmtpConfig | null;
  /** Фолбэк-опрос (минуты), когда мгновенности нет. */
  readonly pollMinutes: number;
  readonly fromAddress: string | null;
  /** Потолок .eml и вложений почты: сверх — не храним, флаг (Р12). Равен
   *  STORAGE_MAX_FILE_BYTES модуля files (200 МБ) — своё поле, чтобы не
   *  тянуть чужой конфиг через границу модулей (I3/I6). */
  readonly sourceMaxBytes: number = 200 * 1024 * 1024;

  constructor(source: NodeJS.ProcessEnv = process.env) {
    const imapHost = unquote(source.MAIL_IMAP_HOST);
    const imapUser = unquote(source.MAIL_IMAP_USER);
    const imapPassword = unquote(source.MAIL_IMAP_PASSWORD);
    this.imap =
      imapHost && imapUser && imapPassword
        ? {
            host: imapHost,
            port: Number(unquote(source.MAIL_IMAP_PORT) ?? 993) || 993,
            user: imapUser,
            password: imapPassword,
          }
        : null;
    const smtpHost = unquote(source.MAIL_SMTP_HOST);
    const smtpUser = unquote(source.MAIL_SMTP_USER);
    const smtpPassword = unquote(source.MAIL_SMTP_PASSWORD);
    this.smtp =
      smtpHost && smtpUser && smtpPassword
        ? {
            host: smtpHost,
            port: Number(unquote(source.MAIL_SMTP_PORT) ?? 587) || 587,
            user: smtpUser,
            password: smtpPassword,
          }
        : null;
    this.pollMinutes = Math.max(1, Number(source.MAIL_POLL_MINUTES ?? 10));
    // .env владельца использует короткое имя MAIL_FROM (контур Керio 23.10):
    // каноническое MAIL_FROM_ADDRESS главнее, короткое — совместимость.
    this.fromAddress = unquote(source.MAIL_FROM_ADDRESS) || unquote(source.MAIL_FROM) || null;
  }

  /** Приём вооружён: и флаг (проверяет сервис), и соединение настроено. */
  get imapReady(): boolean {
    return this.imap !== null;
  }

  /** Отправка вооружена: флаг + SMTP + адрес From. */
  get smtpReady(): boolean {
    return this.smtp !== null && this.fromAddress !== null;
  }
}
