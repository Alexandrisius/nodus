import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ImapFlow } from 'imapflow';

import type { MailClient, MailSourceStream, MailboxStatus } from './mail-client.port.js';
import { MAIL_RECEPTION_CONFIG, type MailReceptionConfig } from './mail-reception.config.js';

/**
 * Реализация MAIL_CLIENT на imapflow (ADR-0035): одно долгоживущее
 * соединение, INBOX выбран постоянно — после 15 с тишины imapflow сам уходит
 * в IDLE и толкает `exists`; любая команда прерывает IDLE и он
 * перезапускается (авто-IDLE imapflow, без disableAutoIdle). Реконнекта в
 * imapflow нет: `close` уходит наверх, backoff решает сервис.
 */
@Injectable()
export class ImapFlowMailClientProvider implements MailClient, OnModuleDestroy {
  private client: ImapFlow | null = null;
  private connecting: Promise<void> | null = null;
  private existsCallback: (() => void) | null = null;
  private closeCallback: (() => void) | null = null;

  constructor(@Inject(MAIL_RECEPTION_CONFIG) private readonly config: MailReceptionConfig) {}

  get connected(): boolean {
    return this.client?.usable === true;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const { host, port, user, password } = this.config.imap!;
      const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass: password },
        logger: false,
        // Логи/секреты наружу не утекают (security-ревью #56).
        emitLogs: false,
      });
      client.on('close', () => {
        this.client = null;
        this.closeCallback?.();
      });
      client.on('error', () => {
        // Причина придёт следом `close` — там один обработчик реконнекта.
      });
      await client.connect();
      this.client = client;
      // INBOX выбран постоянно — только тогда сервер толкает exists (IDLE).
      await client.mailboxOpen('INBOX', { readOnly: true });
      if (this.existsCallback) this.armExists(client);
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.closeCallback = null;
    this.existsCallback = null;
    await client?.logout().catch(() => client?.close());
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private armExists(client: ImapFlow): void {
    client.removeAllListeners('exists');
    client.on('exists', ({ path }: { path?: string }) => {
      if (path && path.toUpperCase() !== 'INBOX') return;
      this.existsCallback?.();
    });
  }

  onExists(callback: () => void): boolean {
    this.existsCallback = callback;
    const client = this.client;
    if (!client) return false;
    this.armExists(client);
    // IDLE поддерживается почти везде; сам факт подписки не гарантирует
    // мгновенности — если сервер не умеет IDLE, imapflow молча опрашивает
    // NOOP, деградация скорости, не авария (ADR-0035, фолбэк в конструкции).
    return true;
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  private require(): ImapFlow {
    if (!this.client) throw new Error('IMAP не подключён');
    return this.client;
  }

  async status(): Promise<MailboxStatus> {
    const client = this.require();
    const status = await client.status('INBOX', {
      uidValidity: true,
      uidNext: true,
      messages: true,
    });
    if (!status) throw new Error('IMAP не отдал статус INBOX');
    return {
      uidValidity: BigInt(status.uidValidity ?? 0),
      uidNext: BigInt(status.uidNext ?? 0),
      exists: status.messages ?? 0,
    };
  }

  async searchAfter(after: bigint): Promise<bigint[]> {
    const client = this.require();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const found = await client.search({ uid: `${after + 1n}:*` }, { uid: true });
      // IMAP `N:*` всегда возвращает и само N* — отфильтровать хвост; false —
      // ящик не ответил (пусто).
      const uids = Array.isArray(found) ? found : [];
      return uids
        .map((uid) => BigInt(uid))
        .filter((uid) => uid > after)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    } finally {
      lock.release();
    }
  }

  async maxUid(): Promise<bigint> {
    const client = this.require();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      // `*` — последнее сообщение по UID: даже пустой ящик отвечает корректно.
      const found = await client.search({ uid: '*' }, { uid: true });
      const uid = Array.isArray(found) ? found[0] : undefined;
      return uid === undefined ? 0n : BigInt(uid);
    } finally {
      lock.release();
    }
  }

  async internalDateOf(uid: bigint): Promise<Date | null> {
    const client = this.require();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const message = await client.fetchOne(uid, { internalDate: true }, { uid: true });
      // fetchOne: false — письма нет; internalDate у imapflow — Date.
      if (!message) return null;
      const internalDate = message.internalDate;
      if (!internalDate) return null;
      return internalDate instanceof Date ? internalDate : new Date(internalDate);
    } finally {
      lock.release();
    }
  }

  async source(uid: bigint, maxBytes: number): Promise<MailSourceStream | null> {
    const client = this.require();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      // Полное сообщение — сырой RFC822 (декодирование частей не для .eml):
      // без part, опции — третьим аргументом.
      const { meta, content } = await client.download(uid, undefined, {
        uid: true,
        maxBytes,
      });
      if (!content) return null;
      return { expectedSize: meta?.expectedSize ?? 0, content };
    } finally {
      lock.release();
    }
  }
}
