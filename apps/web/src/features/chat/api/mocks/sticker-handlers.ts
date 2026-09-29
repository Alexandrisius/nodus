import {
  createStickerPackBodySchema,
  ErrorCode,
  renameStickerPackBodySchema,
} from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import {
  addSticker,
  createPack,
  deletePack,
  getPack,
  installPack,
  listPacks,
  removeSticker,
  renamePack,
  uninstallPack,
} from './sticker-mock-state.js';

/**
 * Хендлеры стикер-паков (#143, Ф1 — моки; живой REST — Ф2): список/деталь,
 * CRUD пака, multipart-загрузка стикера, установка/снятие «себе».
 * Ответы — строго контракты sticker.schemas (мок ≠ контракту = баг).
 * MOCK-СОГЛАШЕНИЕ (как у /chat/attachments): клиент передаёт previewUrl
 * (objectURL) и габариты — в проде url даст MinIO через StorageDriver.
 */

function notFound(message = 'Sticker pack not found') {
  return HttpResponse.json({ code: ErrorCode.NOT_FOUND, message }, { status: 404 });
}

function validationFailed() {
  return HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );
}

export const stickerHandlers = [
  /** Мои паки: корпоративные + свои + установленные (со стикерами). */
  http.get('/api/v1/chat/stickers/packs', () => HttpResponse.json({ items: listPacks() })),

  /** Деталь пака — поповер из чата (пак может быть не в «моих»). */
  http.get('/api/v1/chat/stickers/packs/:id', ({ params }) => {
    const pack = getPack(String(params.id));
    return pack ? HttpResponse.json(pack) : notFound();
  }),

  /** Создание: scope=corporate на живом сервере — право sticker.manage (I8);
   *  мок-актёр перmissive (право видим в UI по permissions актёра). */
  http.post('/api/v1/chat/stickers/packs', async ({ request }) => {
    const parsed = createStickerPackBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    return HttpResponse.json(createPack(parsed.data.title, parsed.data.scope), { status: 201 });
  }),

  http.patch('/api/v1/chat/stickers/packs/:id', async ({ params, request }) => {
    const parsed = renameStickerPackBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const pack = renamePack(String(params.id), parsed.data.title);
    return pack ? HttpResponse.json(pack) : notFound();
  }),

  /** Удаление «для всех» (soft): владелец/админ; сообщения рендерятся дальше. */
  http.delete('/api/v1/chat/stickers/packs/:id', ({ params }) =>
    deletePack(String(params.id)) ? new HttpResponse(null, { status: 204 }) : notFound(),
  ),

  /** Загрузка стикера (multipart): file + emojis (JSON-строка массива) +
   *  поля-подсказки previewUrl/width/height (мок-соглашение). */
  http.post('/api/v1/chat/stickers/packs/:id/stickers', async ({ params, request }) => {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return validationFailed();
    let emojis: string[] = [];
    try {
      const raw = form.get('emojis');
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed))
          emojis = parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      emojis = [];
    }
    if (emojis.length === 0 || emojis.length > 3) return validationFailed();
    const url = form.get('previewUrl');
    const width = Number(form.get('width'));
    const height = Number(form.get('height'));
    const pack = addSticker(String(params.id), {
      file,
      emojis,
      url: typeof url === 'string' && url ? url : null,
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
    });
    return pack ? HttpResponse.json(pack, { status: 201 }) : notFound();
  }),

  http.delete('/api/v1/chat/stickers/stickers/:id', ({ params }) => {
    const pack = removeSticker(String(params.id));
    return pack ? HttpResponse.json(pack) : notFound();
  }),

  /** Установка/снятие «себе» — идемпотентно (повтор — тот же результат). */
  http.post('/api/v1/chat/stickers/packs/:id/install', ({ params }) => {
    const pack = installPack(String(params.id));
    return pack ? HttpResponse.json(pack, { status: 201 }) : notFound();
  }),

  http.delete('/api/v1/chat/stickers/packs/:id/install', ({ params }) => {
    const pack = uninstallPack(String(params.id));
    return pack ? HttpResponse.json(pack) : notFound();
  }),
];
