import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { VaultService } from './vault.service.js';

/** Витрина (#211): RBAC участия, курсор, сборка DTO секций. */
const repo = {
  listAttachments: vi.fn(),
  listLinks: vi.fn(),
  conversationCounts: vi.fn(),
  threadCounts: vi.fn(),
};
const conversations = { findMembership: vi.fn() };
const userProfiles = {
  findRefs: vi.fn(async () => [{ id: 'u1', displayName: 'Аа Бб', avatarUrl: null }]),
};
const signedUrls = {
  fileContentUrl: vi.fn((id: string) => `/api/v1/files/${id}/content?exp=1&sig=x`),
  fileDerivativeUrl: vi.fn(),
};
const service = new VaultService(
  repo as never,
  conversations as never,
  userProfiles as never,
  signedUrls as never,
);

const ATTACHMENT_ROW = {
  id: 'att-1',
  fileId: 'file-1',
  name: 'photo.png',
  size: 100,
  mime: 'image/png',
  kind: 'image',
  width: 800,
  height: 600,
  thumbFileId: 'thumb-1',
  stickerMeta: undefined,
  sortOrder: 0,
  messageId: 'msg-1',
  threadRootId: null,
  seq: 10n,
  authorId: 'u1',
  messageCreatedAt: new Date('2026-10-01T10:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  conversations.findMembership.mockResolvedValue({ userId: 'u1', role: 'member' });
  userProfiles.findRefs.mockResolvedValue([{ id: 'u1', displayName: 'Аа Бб', avatarUrl: null }]);
});

describe('VaultService.list', () => {
  it('не-участник → NOT_FOUND (не раскрываем существование беседы)', async () => {
    conversations.findMembership.mockResolvedValue(null);
    await expect(
      service.list('u1', 'c1', {
        type: 'image',
        limit: 50,
        cursor: undefined,
        threadRootId: undefined,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('image: строка → item с автором, подписанным url и счётчиками', async () => {
    repo.listAttachments.mockResolvedValue({ rows: [ATTACHMENT_ROW], hasMore: false });
    repo.conversationCounts.mockResolvedValue({
      image: 3,
      video: 0,
      audio: 0,
      document: 2,
      link: 1,
    });
    const page = await service.list('u1', 'c1', {
      type: 'image',
      limit: 50,
      cursor: undefined,
      threadRootId: undefined,
    });
    expect(repo.listAttachments).toHaveBeenCalledWith(
      'c1',
      { kind: 'image', limit: 50, threadRootId: null },
      null,
    );
    expect(page.items[0]).toMatchObject({
      type: 'image',
      messageId: 'msg-1',
      author: { id: 'u1' },
      attachment: { fileId: 'file-1', thumbnailUrl: expect.stringContaining('thumb-1') },
    });
    expect(page.counts).toEqual({ image: 3, video: 0, audio: 0, document: 2, link: 1 });
    expect(page.nextCursor).toBeNull();
  });

  it('video: категория → mime-фильтр репозитория; nextCursor кодирует последнюю строку', async () => {
    repo.listAttachments.mockResolvedValue({ rows: [ATTACHMENT_ROW], hasMore: true });
    repo.conversationCounts.mockResolvedValue({
      image: 0,
      video: 1,
      audio: 0,
      document: 1,
      link: 0,
    });
    const page = await service.list('u1', 'c1', {
      type: 'video',
      limit: 50,
      cursor: undefined,
      threadRootId: undefined,
    });
    expect(repo.listAttachments).toHaveBeenCalledWith(
      'c1',
      { kind: 'video', limit: 50, threadRootId: null },
      null,
    );
    expect(page.nextCursor).toBeTruthy();
  });

  it('link: строка проекции → item без вложения; threadRootId → счётчики треда', async () => {
    repo.listLinks.mockResolvedValue({
      rows: [
        {
          messageId: 'msg-2',
          conversationId: 'c1',
          threadRootId: null,
          position: 0,
          url: 'https://example.com/a',
          authorId: 'u1',
          seq: 12n,
          messageCreatedAt: new Date('2026-10-02T10:00:00Z'),
        },
      ],
      hasMore: false,
    });
    repo.threadCounts.mockResolvedValue({ image: 0, video: 0, audio: 0, document: 0, link: 5 });
    const page = await service.list('u1', 'c1', {
      type: 'link',
      limit: 50,
      cursor: undefined,
      threadRootId: 'root-1',
    });
    expect(repo.threadCounts).toHaveBeenCalledWith('c1', 'root-1');
    expect(repo.conversationCounts).not.toHaveBeenCalled();
    expect(page.items[0]).toMatchObject({ type: 'link', url: 'https://example.com/a' });
  });
});
