import { createReadStream, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { letterDetailSchema } from '@nodus/contracts';

import { FILE_STORAGE, type FileStorage } from '../../src/core/ports/file-storage.port.js';
import { MailLetterWriter } from '../../src/modules/correspondence/mail/mail-letter-writer.js';
import type { MailClient } from '../../src/modules/correspondence/mail/mail-client.port.js';
import {
  setupCorrespondenceFixture,
  type CorrespondenceFixture,
} from './correspondence-fixtures.js';

/**
 * Интеграционные трассы приёма почты (#56) на живом PG: дедуп Message-ID,
 * авто-связь и подтверждение галочкой, надгробие спама (переимпорт удалённого
 * не возвращает письмо). IMAP подменён фейковым портом, всё остальное —
 * настоящее приложение (хранилище, транзакции, outbox, движок регистрации).
 */

let fixture: CorrespondenceFixture;
let dir: string;
let writer: MailLetterWriter;

/** Письмо прогона: уникальные Message-ID, чтобы прогоны не видели друг друга. */
function emlOf(opts: { messageId: string; subject?: string; inReplyTo?: string }): string {
  const lines = [
    `Message-ID: <${opts.messageId}>`,
    'From: =?utf-8?B?0J/RgNC+0LHQsCDQv9GA0L7QtdGC0LA=?= <probe@example.test>',
  ];
  if (opts.inReplyTo) lines.push(`In-Reply-To: <${opts.inReplyTo}>`);
  lines.push(
    `Subject: =?utf-8?B?${Buffer.from(opts.subject ?? 'Проба приёма', 'utf8').toString('base64')}?=`,
    'Date: Wed, 28 Oct 2026 09:00:00 +0300',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Тело пробного письма.',
  );
  return lines.join('\r\n');
}

/** Фейковый MAIL_CLIENT: источник — файл прогона на диске. */
function clientOf(raw: string): MailClient {
  const path = join(dir, `eml-${crypto.randomUUID()}.eml`);
  writeFileSync(path, raw, 'utf8');
  return {
    connected: true,
    async connect() {
      return undefined;
    },
    async close() {
      return undefined;
    },
    async status() {
      return { uidValidity: 1n, uidNext: 100n, exists: 1 };
    },
    async searchAfter() {
      return [1n];
    },
    async maxUid() {
      return 1n;
    },
    async source() {
      return { expectedSize: 0, content: createReadStream(path) };
    },
    async internalDateOf() {
      return new Date('2026-10-28T09:00:00Z');
    },
    onExists() {
      return true;
    },
    onClose() {
      return undefined;
    },
  };
}

const RUN_PREFIX = () => `it-mail-${fixture.fx.runId}`;

async function importLetter(raw: string): Promise<{ created: boolean }> {
  const outcome = await writer.write(clientOf(raw), 1n, async () => undefined);
  return { created: outcome.created };
}

const idsOf = async (messageId: string): Promise<string[]> => {
  const rows = await fixture.fx.prisma.letter.findMany({
    where: { mailMessageId: messageId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
};

/** Зарегистрированное исходящее с Message-ID — цель авто-связи (Р5). */
async function seedOutgoing(messageId: string, regNumber: string): Promise<string> {
  const type = await fixture.fx.prisma.processType.findUniqueOrThrow({
    where: { code: 'letter-outgoing' },
  });
  const series = await fixture.fx.prisma.numberSeries.findFirstOrThrow({
    where: { prefix: 'Исх' },
  });
  // Связь типа и маршрута — через схему (workflow_scheme_entries, дефолтная).
  const entry = await fixture.fx.prisma.workflowSchemeEntry.findFirstOrThrow({
    where: { processTypeId: type.id, scheme: { isDefault: true } },
    select: { workflowId: true },
  });
  const stage = await fixture.fx.prisma.workflowStage.findFirstOrThrow({
    where: { workflowId: entry.workflowId },
  });
  const letter = await fixture.fx.prisma.letter.create({
    data: {
      typeId: type.id,
      workflowId: entry.workflowId,
      stageId: stage.id,
      systemState: 'closed',
      direction: 'outgoing',
      source: 'manual',
      createdBy: fixture.registrar.id,
      regNumber,
      regSeriesId: series.id,
      regYear: Number(regNumber.match(/-(\d{4})\//)?.[1]),
      regSeq: Number(regNumber.split('/')[1]),
      regDate: new Date(),
      registeredAt: new Date(),
      registrarId: fixture.registrar.id,
      subject: 'Оферта пробная',
      mailMessageId: messageId,
      receivedAt: new Date(),
    },
  });
  return letter.id;
}

/** «сегодня» в записи темы «на № N от ДД.ММ.ГГГГ» (грамматика подсказки). */
function ruToday(): string {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-');
  return `${day}.${month}.${year}`;
}

beforeAll(async () => {
  fixture = await setupCorrespondenceFixture();
  dir = await mkdtemp(join(tmpdir(), 'nodus-mail-it-'));
  writer = fixture.fx.app.get(MailLetterWriter);
});

afterAll(async () => {
  if (fixture) {
    // Письма прогона (включая надгробия и исходящие): файлы → связи →
    // вложения → события → строки.
    const letters = await fixture.fx.prisma.letter.findMany({
      where: { mailMessageId: { startsWith: RUN_PREFIX() } },
      select: { id: true },
    });
    const ids = letters.map((letter) => letter.id);
    if (ids.length > 0) {
      const fileRows = await fixture.fx.prisma.letterAttachment.findMany({
        where: { letterId: { in: ids } },
        select: { fileId: true },
      });
      await fixture.fx.prisma
        .$transaction([
          fixture.fx.prisma.letterRelation.deleteMany({ where: { letterId: { in: ids } } }),
          fixture.fx.prisma.letterAttachment.deleteMany({ where: { letterId: { in: ids } } }),
          fixture.fx.prisma.event.deleteMany({ where: { aggregateId: { in: ids } } }),
          fixture.fx.prisma.letter.deleteMany({ where: { id: { in: ids } } }),
        ])
        .catch(() => undefined);
      const storage = fixture.fx.app.get<FileStorage>(FILE_STORAGE, { strict: false });
      if (storage && fileRows.length > 0) {
        await storage.remove(fileRows.map((row) => row.fileId)).catch(() => undefined);
      }
    }
    await fixture.cleanup();
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('приём почты #56 (живой PG)', () => {
  it('дедуп Message-ID: переимпорт не создаёт ни строки, ни байта', async () => {
    const messageId = `${RUN_PREFIX()}-dup@example.test`;
    const raw = emlOf({ messageId, subject: 'Дедуп' });
    const first = await importLetter(raw);
    const second = await importLetter(raw);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await idsOf(messageId)).toHaveLength(1);
  });

  it('авто-связь: ответ по цепочке цепляется к зарегистрированному исходящему', async () => {
    const outId = await seedOutgoing(
      `${RUN_PREFIX()}-out@example.test`,
      `Исх-${new Date().getFullYear()}/97701`,
    );
    const messageId = `${RUN_PREFIX()}-reply@example.test`;
    const created = await importLetter(
      emlOf({
        messageId,
        subject: 'RE: Оферта пробная',
        inReplyTo: `${RUN_PREFIX()}-out@example.test`,
      }),
    );
    expect(created.created).toBe(true);
    const [letterId] = (await idsOf(messageId)) as [string];
    const relation = await fixture.fx.prisma.letterRelation.findFirstOrThrow({
      where: { letterId, kind: 'reply_to' },
    });
    expect(relation.relatedLetterId).toBe(outId);
    expect(relation.source).toBe('auto');
    // Карточка несёт связь (бейдж очереди — listItem.replyTo того же поля).
    const res = await fixture.api(fixture.registrar, 'GET', `/letters/${letterId}`);
    expect(res.status).toBe(200);
    const detail = letterDetailSchema.parse(await res.json());
    expect(detail.replyTo?.id).toBe(outId);
  });

  it('подтверждение галочкой: подсказка по теме «на № N от ДД.ММ.ГГГГ» → связь manual', async () => {
    const year = new Date().getFullYear();
    const seq = 97702;
    const outId = await seedOutgoing(`${RUN_PREFIX()}-out2@example.test`, `Исх-${year}/${seq}`);
    const messageId = `${RUN_PREFIX()}-sugg@example.test`;
    await importLetter(emlOf({ messageId, subject: `О допуске — на № ${seq} от ${ruToday()}` }));
    const [letterId] = (await idsOf(messageId)) as [string];
    // Подсказка пришла в карточке (динамика чтения).
    const detailRes = await fixture.api(fixture.registrar, 'GET', `/letters/${letterId}`);
    const detail = letterDetailSchema.parse(await detailRes.json());
    expect(detail.replySuggestion?.id).toBe(outId);
    // Регистрация с подтверждением — связь source='manual'.
    const registration = await fixture.registrationPayload();
    const res = await fixture.register(fixture.registrar, letterId, {
      ...registration,
      replyToLetterId: outId,
    });
    expect(res.status).toBe(200);
    const relation = await fixture.fx.prisma.letterRelation.findFirstOrThrow({
      where: { letterId, kind: 'reply_to' },
    });
    expect(relation.source).toBe('manual');
    // Произвольная цель (не свежая подсказка) — 422 LETTER_RELATION_INVALID.
    const another = await importLetter(
      emlOf({ messageId: `${RUN_PREFIX()}-bad@example.test`, subject: 'Без подсказки' }),
    );
    expect(another.created).toBe(true);
    const [badId] = (await idsOf(`${RUN_PREFIX()}-bad@example.test`)) as [string];
    const badRes = await fixture.register(fixture.registrar, badId, {
      ...registration,
      replyToLetterId: outId,
    });
    expect(badRes.status).toBe(422);
    expect(((await badRes.json()) as { code?: string }).code).toBe('LETTER_RELATION_INVALID');
  });

  it('спам-надгробие: удалённое не возвращается повторным импортом', async () => {
    const messageId = `${RUN_PREFIX()}-spam@example.test`;
    await importLetter(emlOf({ messageId, subject: 'Мусор' }));
    const [letterId] = (await idsOf(messageId)) as [string];
    const del = await fixture.api(fixture.registrar, 'DELETE', `/letters/${letterId}`);
    expect(del.status).toBe(204);
    // Строка-надгробие живёт: Message-ID держит дедуп, файлы снесены.
    const tombstone = await fixture.fx.prisma.letter.findUniqueOrThrow({
      where: { id: letterId },
    });
    expect(tombstone.deletedAt).not.toBeNull();
    expect(await fixture.fx.prisma.letterAttachment.count({ where: { letterId } })).toBe(0);
    // Карточка надгробия — 404 (списки фильтруют так же).
    expect((await fixture.api(fixture.registrar, 'GET', `/letters/${letterId}`)).status).toBe(404);
    // Переимпорт того же Message-ID — ни строки, ни карточки.
    const again = await importLetter(emlOf({ messageId, subject: 'Мусор' }));
    expect(again.created).toBe(false);
    expect(await idsOf(messageId)).toHaveLength(1);
  });
});
