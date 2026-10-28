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
    const imapHost = source.MAIL_IMAP_HOST?.trim();
    const imapUser = source.MAIL_IMAP_USER?.trim();
    const imapPassword = source.MAIL_IMAP_PASSWORD;
    this.imap =
      imapHost && imapUser && imapPassword
        ? {
            host: imapHost,
            port: Number(source.MAIL_IMAP_PORT ?? 993),
            user: imapUser,
            password: imapPassword,
          }
        : null;
    const smtpHost = source.MAIL_SMTP_HOST?.trim();
    const smtpUser = source.MAIL_SMTP_USER?.trim();
    const smtpPassword = source.MAIL_SMTP_PASSWORD;
    this.smtp =
      smtpHost && smtpUser && smtpPassword
        ? {
            host: smtpHost,
            port: Number(source.MAIL_SMTP_PORT ?? 587),
            user: smtpUser,
            password: smtpPassword,
          }
        : null;
    this.pollMinutes = Math.max(1, Number(source.MAIL_POLL_MINUTES ?? 10));
    this.fromAddress = source.MAIL_FROM_ADDRESS?.trim() || null;
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
