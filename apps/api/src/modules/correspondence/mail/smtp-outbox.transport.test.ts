import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SmtpOutboxTransport, type SmtpOutboxJob } from './smtp-outbox.transport.js';
import { MailReceptionConfig } from './mail-reception.config.js';

const sendMail = vi.fn();
const moveToFailed = vi.fn();

vi.mock('ioredis', () => {
  const FakeRedis = class {
    duplicate() {
      return {} as never;
    }
    disconnect(): void {
      return undefined;
    }
  };
  return { Redis: FakeRedis };
});
vi.mock('bullmq', () => {
  const FakeQueue = class {
    add = vi.fn();
    close = vi.fn();
    upsertJobScheduler = vi.fn();
  };
  const FakeWorker = class {};
  return { Queue: FakeQueue, Worker: FakeWorker };
});
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail, close: () => undefined })),
  },
}));

process.env.REDIS_URL = 'redis://test';

const JOB: SmtpOutboxJob = {
  letterId: '11111111-1111-4111-8111-111111111111',
  to: ['info@partner.by'],
  subject: 'Оферта',
  text: 'Текст',
  attachmentFileIds: [],
};

function makeTransport() {
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  const transport = new SmtpOutboxTransport(
    new MailReceptionConfig({
      MAIL_SMTP_HOST: 'smtp.test',
      MAIL_SMTP_USER: 'u',
      MAIL_SMTP_PASSWORD: 'p',
      MAIL_FROM_ADDRESS: 'chancery@passat.by',
    }),
    { run: async (cb: (tx: unknown) => Promise<void>) => cb({}) } as never,
    {
      emit: async (_tx: unknown, type: string, payload: Record<string, unknown>) => {
        events.push({ type, payload });
      },
    } as never,
    {
      get: async () => null,
    } as never,
    { setContext() {}, info() {}, warn() {}, error() {} } as never,
  );
  const send = (transport as unknown as { send: (job: unknown) => Promise<unknown> }).send.bind(
    transport,
  );
  const job = {
    data: JOB,
    attemptsMade: 0,
    moveToFailed,
  };
  return { transport, send, job, events };
}

describe('SmtpOutboxTransport: повторы и провалы (#56, Р7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockReset();
  });

  it('успех: messageId/accepted/rejected — для записи Message-ID (#464)', async () => {
    const { send, job } = makeTransport();
    sendMail.mockResolvedValue({
      messageId: '<abc@passat.by>',
      accepted: ['info@partner.by'],
      rejected: [],
    });
    const result = (await send(job)) as { messageId: string; accepted: string[] };
    expect(result.messageId).toBe('<abc@passat.by>');
    expect(result.accepted).toEqual(['info@partner.by']);
  });

  it('4xx/сеть: без события — повтор по расписанию BullMQ', async () => {
    const { send, job, events } = makeTransport();
    sendMail.mockRejectedValue(Object.assign(new Error('greylist'), { responseCode: 421 }));
    await expect(send(job)).rejects.toThrow('greylist');
    expect(events).toEqual([]);
    expect(moveToFailed).not.toHaveBeenCalled();
  });

  it('5xx: событие letter_send_failed сразу, задание без повторов', async () => {
    const { send, job, events } = makeTransport();
    sendMail.mockRejectedValue(Object.assign(new Error('reject'), { responseCode: 554 }));
    await expect(send(job)).rejects.toThrow('reject');
    expect(moveToFailed).toHaveBeenCalledTimes(1);
    const failed = events.find((event) => event.type === 'correspondence.letter_send_failed');
    expect(failed?.payload.letterId).toBe(JOB.letterId);
    expect(failed?.payload.error).toBe('reject');
  });
});
