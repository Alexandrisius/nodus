import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkpeekError } from 'linkpeek';

const { previewMock, guardedFetchMock } = vi.hoisted(() => ({
  previewMock: vi.fn(),
  guardedFetchMock: vi.fn(),
}));
vi.mock('linkpeek', () => ({
  preview: previewMock,
  LinkpeekError: class LinkpeekError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
  validateUrl: vi.fn(),
  isPrivateHost: vi.fn((host: string) => host === 'localhost' || /^\d+\./.test(host)),
}));
vi.mock('./safe-fetch.js', () => ({
  SsrfBlockedError: class SsrfBlockedError extends Error {},
  ssrfGuardedFetch: guardedFetchMock,
  ssrfGuardedAgent: vi.fn(() => ({})),
  disposeSsrfAgent: vi.fn(async () => undefined),
}));

import { LinkPreviewService } from './link-preview.service.js';

/** Конвейер превью (#212): воркер-логика — гварды/кэш/событие; linkpeek и
 *  SILO замоканы (сеть — живым прогоном песочницы). */

const JOB = {
  conversationId: '00000000-0000-4000-8000-0000000000c1',
  messageId: '00000000-0000-4000-8000-0000000000m1',
  authorId: '00000000-0000-4000-8000-0000000000a1',
  rawUrl: 'https://example.com/page?utm_source=x&id=1',
  normalizedUrl: 'https://example.com/page?id=1',
};

function makeService(over: Record<string, unknown> = {}) {
  const repo = {
    findAlive: vi.fn(async (): Promise<Map<string, unknown>> => new Map()),
    existsAny: vi.fn(async (): Promise<Set<string>> => new Set()),
    markPending: vi.fn(async (): Promise<void> => undefined),
    upsertReady: vi.fn(async (): Promise<void> => undefined),
    upsertFailed: vi.fn(async (): Promise<void> => undefined),
    upsertBlocked: vi.fn(async (): Promise<void> => undefined),
    ...over,
  };
  const eventBus = { emit: vi.fn(async (): Promise<void> => undefined) };
  const txRunner = { run: vi.fn(async (cb: (tx: string) => unknown) => cb('tx')) };
  const signedUrls = { fileContentUrl: vi.fn((id: string) => `/files/${id}`) };
  const storage = { save: vi.fn(async () => ({ fileId: 'f-1' })) };
  const rateLimiter = { allow: vi.fn(async () => true) };
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const svc = new LinkPreviewService(
    repo as never,
    eventBus as never,
    txRunner as never,
    signedUrls as never,
    storage as never,
    rateLimiter as never,
    logger as never,
  );
  return { svc, repo, eventBus, storage, rateLimiter };
}

beforeEach(() => {
  previewMock.mockReset();
});

// 1×1 прозрачный PNG: sharp-дериват в юнит-окружении без сети (картинка
// качается через ssrfGuardedFetch — замокан выше).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
beforeEach(() => {
  guardedFetchMock.mockReset();
  guardedFetchMock.mockImplementation(
    async () => new Response(new Uint8Array(PNG_1PX), { status: 200 }),
  );
});

function cacheRow(status: string, over: Record<string, unknown> = {}) {
  return {
    normalizedUrl: JOB.normalizedUrl,
    status,
    title: null,
    description: null,
    siteName: 'example.com',
    imageFileId: null,
    faviconFileId: null,
    fetchedAt: new Date(),
    expiresAt: new Date(),
    ...over,
  };
}

describe('LinkPreviewService.processJob', () => {
  it('SSRF-гвард порта — blocked навсегда + событие blocked', async () => {
    const { svc, repo, eventBus } = makeService({
      findAlive: vi.fn(
        async () =>
          new Map<string, unknown>([[JOB.normalizedUrl, cacheRow('blocked')]] as [
            string,
            unknown,
          ][]),
      ),
    });
    await svc.processJob({ ...JOB, rawUrl: 'http://192.168.1.10:9200/x' });
    expect(repo.upsertBlocked).toHaveBeenCalled();
    expect(repo.upsertReady).not.toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalled();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('self-домен — карточка из домена БЕЗ фетча', async () => {
    const selfUrl = 'https://nodus.by/home';
    const { svc, repo } = makeService({
      findAlive: vi.fn(
        async () =>
          new Map([[selfUrl, cacheRow('ready', { normalizedUrl: selfUrl, siteName: 'nodus.by' })]]),
      ),
    });
    await svc.processJob({ ...JOB, rawUrl: selfUrl, normalizedUrl: selfUrl });
    expect(previewMock).not.toHaveBeenCalled();
    expect(repo.upsertReady).toHaveBeenCalledWith(
      selfUrl,
      expect.objectContaining({ siteName: 'nodus.by' }),
    );
  });

  it('успех: linkpeek → кламп полей → og:image дериват → кэш ready + событие', async () => {
    previewMock.mockResolvedValue({
      title: '  Заголовок   сайта ',
      description: 'Описание',
      siteName: 'example.com',
      image: 'https://cdn.example.com/og.png',
    });
    const { svc, repo, eventBus, storage } = makeService({
      findAlive: vi.fn(
        async (urls: string[]) =>
          new Map(
            urls.map((u) => [
              u,
              {
                normalizedUrl: u,
                status: 'ready',
                title: 'Заголовок сайта',
                description: 'Описание',
                siteName: 'example.com',
                imageFileId: 'f-1',
                faviconFileId: null,
                fetchedAt: new Date(),
                expiresAt: new Date(),
              },
            ]),
          ),
      ),
    });
    await svc.processJob(JOB);
    expect(previewMock).toHaveBeenCalledWith(
      JOB.rawUrl,
      expect.objectContaining({
        allowPrivateIPs: false,
        maxBytes: 30_000,
        fetch: expect.any(Function),
      }),
    );
    expect(storage.save).toHaveBeenCalled(); // og:image → SILO
    expect(repo.upsertReady).toHaveBeenCalledWith(
      JOB.normalizedUrl,
      expect.objectContaining({ title: 'Заголовок сайта', imageFileId: 'f-1' }),
    );
    const call = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const [tx, type, payload] = call as [
      string,
      string,
      { preview: { status: string; imageUrl: string } },
    ];
    expect(tx).toBe('tx');
    expect(type).toBe('chat.link_preview_ready');
    expect(payload!.preview.status).toBe('ready');
    expect(payload!.preview.imageUrl).toContain('/files/f-1');
  });

  it('PRIVATE_NETWORK_BLOCKED от linkpeek — blocked + событие', async () => {
    previewMock.mockRejectedValue(new LinkpeekError('PRIVATE_NETWORK_BLOCKED', 'private'));
    const { svc, repo, eventBus } = makeService({
      findAlive: vi.fn(
        async () =>
          new Map<string, unknown>([[JOB.normalizedUrl, cacheRow('blocked')]] as [
            string,
            unknown,
          ][]),
      ),
    });
    await svc.processJob(JOB);
    expect(repo.upsertBlocked).toHaveBeenCalledWith(JOB.normalizedUrl);
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it('сетевая ошибка — отрицательный кэш (failed) + событие failed', async () => {
    previewMock.mockRejectedValue(new Error('fetch failed'));
    const { svc, repo, eventBus } = makeService({
      findAlive: vi.fn(
        async () => new Map([[JOB.normalizedUrl, cacheRow('failed')]] as [string, unknown][]),
      ),
    });
    await svc.processJob(JOB);
    expect(repo.upsertFailed).toHaveBeenCalledWith(JOB.normalizedUrl);
    expect(eventBus.emit).toHaveBeenCalled();
  });

  it('битая картинка не роняет превью — карточка без imageFileId', async () => {
    previewMock.mockResolvedValue({
      title: 'T',
      description: null,
      siteName: 'example.com',
      image: 'https://example.com:8080/x.png', // порт запрещён гвардом
    });
    const { svc, repo } = makeService({
      findAlive: vi.fn(
        async (urls: string[]) =>
          new Map(
            urls.map((u) => [
              u,
              {
                normalizedUrl: u,
                status: 'ready',
                title: 'T',
                description: null,
                siteName: 'example.com',
                imageFileId: null,
                faviconFileId: null,
                fetchedAt: new Date(),
                expiresAt: new Date(),
              },
            ]),
          ),
      ),
    });
    await svc.processJob(JOB);
    expect(repo.upsertReady).toHaveBeenCalledWith(
      JOB.normalizedUrl,
      expect.objectContaining({ imageFileId: null }),
    );
  });
});

describe('LinkPreviewService.previewsForUrls', () => {
  it('отсутствующий URL — pending-заглушка с доменом, готовый — DTO с signed URL', async () => {
    const { svc } = makeService({
      findAlive: vi.fn(
        async () =>
          new Map([
            [
              'https://a.com/x',
              {
                normalizedUrl: 'https://a.com/x',
                status: 'ready',
                title: 'T',
                description: null,
                siteName: 'a.com',
                imageFileId: 'f-9',
                faviconFileId: null,
                fetchedAt: new Date(),
                expiresAt: new Date(),
              },
            ],
          ]),
      ),
    });
    const map = await svc.previewsForUrls(['https://a.com/x', 'https://b.com/y']);
    expect(map.get('https://a.com/x')).toMatchObject({ status: 'ready', imageUrl: '/files/f-9' });
    expect(map.get('https://b.com/y')).toMatchObject({ status: 'pending', siteName: 'b.com' });
  });

  it('failed — заглушка из домена (бот-блокировка, I11)', async () => {
    const { svc } = makeService({
      findAlive: vi.fn(
        async () =>
          new Map([
            [
              'https://c.com/x',
              {
                normalizedUrl: 'https://c.com/x',
                status: 'failed',
                title: 'T',
                description: null,
                siteName: 'c.com',
                imageFileId: null,
                faviconFileId: null,
                fetchedAt: new Date(),
                expiresAt: new Date(),
              },
            ],
          ]),
      ),
    });
    const map = await svc.previewsForUrls(['https://c.com/x']);
    expect(map.get('https://c.com/x')).toMatchObject({
      status: 'failed',
      siteName: 'c.com',
      title: null,
    });
  });
});
