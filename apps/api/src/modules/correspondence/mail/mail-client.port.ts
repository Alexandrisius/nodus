import type { InjectionToken } from '@nestjs/common';
import type { Readable } from 'node:stream';

/**
 * Порт почтового клиента (IMAP, #56/ADR-0035; I13): подсистема приёма знает
 * только readonly-операции — статус ящика, поиск новых UID, стрим исходника,
 * уведомление о появлении писем (IDLE) и разрыв соединения. Реализация —
 * imapflow; логика курсора/дедупа/реконнектов живёт в MailInboxService и
 * тестируется на фейке порта без живого ящика. Сервер не меняем: приём
 * никогда не удаляет и не помечает письма.
 */
export const MAIL_CLIENT: InjectionToken = 'MAIL_CLIENT';

/** Статус INBOX: курсорная ось UIDVALIDITY и потолок UID. */
export interface MailboxStatus {
  uidValidity: bigint;
  uidNext: bigint;
  exists: number;
}

/** Исходник письма: сырой RFC822 (то, что храним как .eml) стримом. */
export interface MailSourceStream {
  /** RFC822.SIZE всего письма — заявленный размер сохраняемого .eml. */
  expectedSize: number;
  content: Readable;
}

export interface MailClient {
  /** Соединение (implicit TLS 993); бросает при недоступности. */
  connect(): Promise<void>;
  close(): Promise<void>;
  readonly connected: boolean;

  status(): Promise<MailboxStatus>;

  /** UID писем с UID > after, по возрастанию (обработка в порядке ящика). */
  searchAfter(after: bigint): Promise<bigint[]>;

  /** Максимальный UID ящика (первый запуск: «всё старое не импортируем», В5). */
  maxUid(): Promise<bigint>;

  /** Исходник письма стримом с потолком байт; null — письмо исчезло. */
  source(uid: bigint, maxBytes: number): Promise<MailSourceStream | null>;

  /** INTERNALDATE письма — момент поступления (ось очереди «Новые»);
   *  null — письмо исчезло. */
  internalDateOf(uid: bigint): Promise<Date | null>;

  /** Уведомление «есть новые письма» (IDLE exists / авто-опрос imapflow).
   *  false — сервер без IDLE: мгновенности нет, живём фолбэк-опросом. */
  onExists(callback: () => void): boolean;

  /** Разрыв соединения — реконнект с backoff решает сервис. */
  onClose(callback: () => void): void;
}
