import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, messageSchema, stickerPackSchema, type ChatMessage } from '@nodus/contracts';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Контракт стикеров на живом HTTP + хранилище (критерий приёмки #143):
 * создание пака → multipart-загрузка (magic bytes) → стикер-сообщение со
 * снапшотом пака → дистрибуция «из чата» (install) → отправка из чужого
 * пака → soft-delete не ломает ленту → права/идемпотентность.
 */

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
/** WebM-контейнер: серверная проверка — magic bytes + лимит, декодирование не требуется. */
const WEBM_BYTES = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01, 1, 2]);

describe.skipIf(!process.env.DATABASE_URL || !process.env.STORAGE_ACCESS_KEY)(
  'chat: стикер-паки (integration, #143)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob'>;
    let alice: ChatUser;
    let bob: ChatUser;
    let origin = '';
    let adminLikeToken = '';

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob']);
      ({ alice, bob } = fx.users);
      origin = fx.baseUrl.replace(/\/api\/v1$/, '');
      // Право sticker.manage живёт в JWT: минтим «админский» токен для alice
      // (гейт в сервисе, не в гварде маршрута — условие зависит от scope).
      const tokenService = fx.app.get(TokenService);
      adminLikeToken = await tokenService.signAccessToken(
        {
          id: alice.id,
          email: alice.email,
          displayName: alice.displayName,
          permissions: ['sticker.manage'],
        },
        'integration-test-session',
      );
    }, 120_000);

    afterAll(async () => {
      if (!fx) return;
      try {
        await fx.prisma.stickerPack.deleteMany({
          where: { createdBy: { in: [alice.id, bob.id] } },
        });
        await fx.prisma.messageAttachment.deleteMany({
          where: { ownerId: { in: [alice.id, bob.id] } },
        });
        await fx.prisma.fileObject.deleteMany({ where: { ownerId: { in: [alice.id, bob.id] } } });
      } finally {
        await fx.cleanup();
      }
    });

    function apiAs(
      token: string,
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown,
      key?: string,
    ): Promise<Response> {
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (key !== undefined) headers['idempotency-key'] = key;
      return fetch(`${fx.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }

    function uploadSticker(
      user: ChatUser,
      packId: string,
      file: Blob,
      fields: Record<string, string>,
    ): Promise<Response> {
      const form = new FormData();
      // Контракт #57/#143: текстовые поля ДО файловой части.
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      form.append('file', file, 'sticker');
      return fetch(`${fx.baseUrl}/chat/stickers/packs/${packId}/stickers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${user.token}` },
        body: form,
      });
    }

    async function makeConversation(): Promise<string> {
      const res = await fx.api(alice, 'POST', '/chat/conversations', {
        body: { type: 'group', title: `Стикеры ${fx.runId}`, memberIds: [bob.id] },
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { id: string }).id;
    }

    it('корпоративный пак без права — 403; личный — 201 у любого', async () => {
      const denied = await fx.api(bob, 'POST', '/chat/stickers/packs', {
        body: { title: 'Корп без права', scope: 'corporate' },
      });
      expect(denied.status).toBe(403);
      expect(((await denied.json()) as { code: string }).code).toBe(ErrorCode.FORBIDDEN);

      const created = await fx.api(alice, 'POST', '/chat/stickers/packs', {
        body: { title: 'Мемы', scope: 'personal' },
        key: 'st-create-1',
      });
      expect(created.status).toBe(201);
      const pack = stickerPackSchema.parse(await created.json());
      expect(pack).toMatchObject({
        title: 'Мемы',
        scope: 'personal',
        owned: true,
        installed: false,
      });
      expect(pack.stickers).toHaveLength(0);
    });

    it('загрузка: PNG/JPEG/WebM по magic bytes, подделка (GIF под видом png) — отказ с кодом', async () => {
      const list = (await (await fx.api(alice, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string; scope: string }[];
      };
      const packId = list.items.find((p) => p.scope === 'personal')!.id;

      const png = new Blob([PNG_BYTES], { type: 'image/png' });
      const ok = await uploadSticker(alice, packId, png, {
        emojis: JSON.stringify(['🔥', '👍']),
        size: String(PNG_BYTES.length),
        width: '512',
        height: '512',
      });
      expect(ok.status).toBe(201);
      const withPng = stickerPackSchema.parse(await ok.json());
      expect(withPng.stickers).toHaveLength(1);
      expect(withPng.stickers[0]).toMatchObject({
        mime: 'image/png',
        width: 512,
        emojis: ['🔥', '👍'],
      });
      expect(withPng.stickers[0]?.url).toMatch(/^\/api\/v1\/files\/[^/]+\/content\?exp=\d+&sig=/);

      // JPEG — принимается (#175, паритет с Битриксом): magic FF D8 FF,
      // mime выводится из байтов, независимо от заявленного.
      const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], {
        type: 'image/png',
      });
      const okJpeg = await uploadSticker(alice, packId, jpeg, {
        emojis: JSON.stringify(['👀']),
        size: '8',
      });
      expect(okJpeg.status).toBe(201);
      const withJpeg = stickerPackSchema.parse(await okJpeg.json());
      expect(withJpeg.stickers.at(-1)?.mime).toBe('image/jpeg');

      // WebM: заявлен video/webm, байты контейнера — норм (magic 1A45DFA3).
      const webm = new Blob([WEBM_BYTES], { type: 'video/webm' });
      const okWebm = await uploadSticker(alice, packId, webm, {
        emojis: JSON.stringify(['🎉']),
        size: String(WEBM_BYTES.length),
      });
      expect(okWebm.status).toBe(201);
      const withWebm = stickerPackSchema.parse(await okWebm.json());
      expect(withWebm.stickers.at(-1)?.mime).toBe('video/webm');
      // WebM-стикер отдаётся inline (проигрывание <video>, INLINE_MIME #143).
      const webmFetch = await fetch(`${origin}${withWebm.stickers.at(-1)?.url}`);
      expect(webmFetch.headers.get('content-disposition')).toContain('inline');

      // Подделка: GIF-байты под видом image/png — CHAT_STICKER_INVALID.
      const gif = new Blob([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1])], {
        type: 'image/png',
      });
      const noGif = await uploadSticker(alice, packId, gif, {
        emojis: JSON.stringify(['😀']),
        size: '7',
      });
      expect(noGif.status).toBe(400);
      expect(((await noGif.json()) as { code: string }).code).toBe(ErrorCode.CHAT_STICKER_INVALID);
    });

    it('сквозная: отправка со снапшотом → лента второй сессии → «добавить пак из чата» → ответный стикер', async () => {
      const conv = await makeConversation();
      const list = (await (await fx.api(alice, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string; scope: string; stickers: { id: string }[] }[];
      };
      const pack = list.items.find((p) => p.scope === 'personal')!;
      const stickerId = pack.stickers[0]!.id;

      // Черновик живёт: стикер его НЕ гасит (keepDraft, #143).
      const draft = await fx.api(alice, 'PUT', `/chat/conversations/${conv}/draft`, {
        body: { text: 'не съедай мой текст' },
      });
      expect(draft.status).toBe(200);

      const sent = await fx.api(alice, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId },
        key: 'st-send-1',
      });
      expect(sent.status).toBe(201);
      const dto = messageSchema.parse(await sent.json());
      expect(dto.text).toBe('');
      expect(dto.attachments).toHaveLength(1);
      expect(dto.attachments[0]).toMatchObject({ kind: 'sticker', name: 'sticker.png' });
      expect(dto.attachments[0]?.sticker).toMatchObject({
        packId: pack.id,
        packTitle: 'Мемы',
        packScope: 'personal',
      });

      // Идемпотентность: тот же ключ — то же сообщение, дублей нет.
      const replay = await fx.api(alice, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId },
        key: 'st-send-1',
      });
      expect(replay.status).toBe(201);
      expect(((await replay.json()) as ChatMessage).id).toBe(dto.id);

      // Черновик цел (живого detail-маршрута нет — черновик в элементе списка).
      const convList = await fx.listConversations(alice);
      const listItem = convList.items.find((c) => c.id === conv);
      expect(listItem?.draft?.text).toBe('не съедай мой текст');

      // Вторая сессия видит стикер в ленте; пака у неё НЕТ (список без него).
      const feed = await fx.api(bob, 'GET', `/chat/conversations/${conv}/messages?limit=50`);
      const seen = ((await feed.json()) as { items: ChatMessage[] }).items.find(
        (m) => m.id === dto.id,
      );
      expect(seen?.attachments[0]?.kind).toBe('sticker');
      const bobList = (await (await fx.api(bob, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string }[];
      };
      expect(bobList.items.some((p) => p.id === pack.id)).toBe(false);

      // Дистрибуция «из чата»: деталь + установка → пак в списке, отправка ок.
      const detail = await fx.api(bob, 'GET', `/chat/stickers/packs/${pack.id}`);
      expect(detail.status).toBe(200);
      const installed = await fx.api(bob, 'POST', `/chat/stickers/packs/${pack.id}/install`, {
        key: 'st-inst-1',
      });
      expect(installed.status).toBe(201);
      expect(stickerPackSchema.parse(await installed.json())).toMatchObject({
        installed: true,
        owned: false,
      });

      const bobList2 = (await (await fx.api(bob, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string; installed: boolean }[];
      };
      expect(bobList2.items.find((p) => p.id === pack.id)).toMatchObject({ installed: true });

      // Деталь ПОСЛЕ установки тоже честная (валидатор Ф2: пустой Set в get()
      // ломал окно установленного чужого пака — футер/меню по installed).
      const detailAfter = stickerPackSchema.parse(
        await (await fx.api(bob, 'GET', `/chat/stickers/packs/${pack.id}`)).json(),
      );
      expect(detailAfter).toMatchObject({ installed: true, owned: false });

      const bobSent = await fx.api(bob, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId },
        key: 'st-send-bob',
      });
      expect(bobSent.status).toBe(201);
      expect(messageSchema.parse(await bobSent.json()).attachments[0]?.kind).toBe('sticker');

      // Повторная установка — идемпотентна (201, одна строка user_sticker_packs).
      const again = await fx.api(bob, 'POST', `/chat/stickers/packs/${pack.id}/install`, {
        key: 'st-inst-2',
      });
      expect(again.status).toBe(201);
      const installs = await fx.prisma.userStickerPack.count({
        where: { userId: bob.id, packId: pack.id },
      });
      expect(installs).toBe(1);
    });

    it('soft-delete пака: исчезает из пикеров у всех, сообщения рендерятся дальше', async () => {
      const conv = await makeConversation();
      const list = (await (await fx.api(alice, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string; scope: string; stickers: { id: string }[] }[];
      };
      const pack = list.items.find((p) => p.scope === 'personal')!;
      const sent = await fx.api(alice, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId: pack.stickers[0]!.id },
        key: 'st-send-3',
      });
      expect(sent.status).toBe(201);
      const dto = messageSchema.parse(await sent.json());

      const removed = await fx.api(alice, 'DELETE', `/chat/stickers/packs/${pack.id}`);
      expect(removed.status).toBe(204);

      // Из списков обоих пак пропал; отправка его стикера — 404.
      for (const user of [alice, bob]) {
        const l = (await (await fx.api(user, 'GET', '/chat/stickers/packs')).json()) as {
          items: { id: string }[];
        };
        expect(l.items.some((p) => p.id === pack.id)).toBe(false);
      }
      const stale = await fx.api(alice, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId: pack.stickers[0]!.id },
        key: 'st-send-4',
      });
      expect(stale.status).toBe(404);

      // Лента не сломана: снапшот на вложении живёт после удаления пака.
      const feed = await fx.api(bob, 'GET', `/chat/conversations/${conv}/messages?limit=50`);
      const seen = ((await feed.json()) as { items: ChatMessage[] }).items.find(
        (m) => m.id === dto.id,
      );
      expect(seen?.attachments[0]).toMatchObject({ kind: 'sticker' });
      expect(seen?.attachments[0]?.sticker?.packTitle).toBe('Мемы');
    });

    it('право sticker.manage: корпоративный пак создаётся и виден всем без установки', async () => {
      const created = await apiAs(
        adminLikeToken,
        'POST',
        '/chat/stickers/packs',
        { title: 'Nodus', scope: 'corporate' },
        'st-corp-1',
      );
      expect(created.status).toBe(201);
      const corp = stickerPackSchema.parse(await created.json());
      expect(corp).toMatchObject({ scope: 'corporate', owned: false, installed: false });

      // Загрузка в корпоративный — только с правом.
      const png = new Blob([PNG_BYTES], { type: 'image/png' });
      const denied = await uploadSticker(bob, corp.id, png, {
        emojis: JSON.stringify(['🚀']),
        size: String(PNG_BYTES.length),
      });
      expect(denied.status).toBe(403);
      const ok = await fetch(`${fx.baseUrl}/chat/stickers/packs/${corp.id}/stickers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminLikeToken}` },
        body: (() => {
          const form = new FormData();
          form.append('emojis', JSON.stringify(['🚀']));
          form.append('size', String(PNG_BYTES.length));
          form.append('file', png, 'sticker.png');
          return form;
        })(),
      });
      expect(ok.status).toBe(201);

      // Корпоративный виден bob без установки и отправляется им.
      const bobList = (await (await fx.api(bob, 'GET', '/chat/stickers/packs')).json()) as {
        items: { id: string; installed: boolean }[];
      };
      expect(bobList.items.find((p) => p.id === corp.id)).toMatchObject({ installed: false });

      const conv = await makeConversation();
      const corpSticker = stickerPackSchema.parse(await ok.json()).stickers[0]!;
      const sent = await fx.api(bob, 'POST', `/chat/conversations/${conv}/messages`, {
        body: { text: '', stickerId: corpSticker.id },
        key: 'st-corp-send',
      });
      expect(sent.status).toBe(201);
      expect(messageSchema.parse(await sent.json()).attachments[0]?.sticker).toMatchObject({
        packScope: 'corporate',
      });
    });

    it('события outbox (I9): пак/загрузка/установка пишутся в event log', async () => {
      const types = await fx.prisma.event.findMany({
        where: { aggregateType: 'sticker_pack' },
        select: { type: true },
      });
      const seen = new Set(types.map((e) => e.type));
      expect(seen.has('chat.sticker_pack_created')).toBe(true);
      expect(seen.has('chat.sticker_added')).toBe(true);
      expect(seen.has('chat.sticker_pack_installed')).toBe(true);
      expect(seen.has('chat.sticker_pack_deleted')).toBe(true);
    });
  },
);
