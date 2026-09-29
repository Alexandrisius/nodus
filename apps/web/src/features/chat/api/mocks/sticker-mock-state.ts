import type { Sticker, StickerPack } from '@nodus/contracts';

import { userIds } from '../../../../shared/mocks/data/users.js';
import { getMockActor } from '../../../../shared/mocks/mock-actor.js';

/**
 * Состояние мок-домена стикеров (#143): демо-паки (корпоративный + личный
 * актёра + чужой для дистрибуции «из чата»), установки per-actor, операции
 * CRUD. Модель БД (Ф2 #143): sticker_packs/stickers/user_sticker_packs —
 * мок отражает её видимую клиенту проекцию (owned/installed).
 */

/** sid(n) — стабильные id демо-стикеров и паков (читаемые в моках/e2e). */
const sid = (n: number): string => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface MockPack {
  id: string;
  title: string;
  scope: 'corporate' | 'personal';
  ownerId: string | null;
  deletedAt: string | null;
  stickers: Sticker[];
}

/** Демо-ассеты: /stickers/demo/*.png — 512px статика (генерация, см. репо);
 *  /reactions/*.webp — анимированные 64px (демо анимации, реальный размер
 *  придёт с загрузками пользователей). */
function st(
  n: number,
  packId: string,
  emojis: string[],
  url: string,
  mime: string,
  wh: number,
): Sticker {
  return {
    id: sid(n),
    packId,
    emojis,
    url,
    mime,
    size: 24_000,
    width: wh,
    height: wh,
  };
}

const CORPORATE_ID = sid(1);
const PERSONAL_ID = sid(2);
const FOREIGN_ID = sid(3);

const packs: MockPack[] = [
  {
    id: CORPORATE_ID,
    title: 'Nodus',
    scope: 'corporate',
    ownerId: null,
    deletedAt: null,
    stickers: [
      st(101, CORPORATE_ID, ['🚀'], '/stickers/demo/rocket.png', 'image/png', 512),
      st(102, CORPORATE_ID, ['👍'], '/stickers/demo/thumbs_up.png', 'image/png', 512),
      st(103, CORPORATE_ID, ['💯'], '/stickers/demo/hundred_points.png', 'image/png', 512),
      st(104, CORPORATE_ID, ['✅'], '/stickers/demo/check_mark.png', 'image/png', 512),
      st(105, CORPORATE_ID, ['🔥'], '/stickers/demo/fire.png', 'image/png', 512),
      st(106, CORPORATE_ID, ['🎉'], '/stickers/demo/party_popper.png', 'image/png', 512),
      st(107, CORPORATE_ID, ['😂'], '/stickers/demo/laughing.png', 'image/png', 512),
      st(108, CORPORATE_ID, ['❤️'], '/stickers/demo/red_heart.png', 'image/png', 512),
      st(109, CORPORATE_ID, ['🙏'], '/reactions/folded_hands.webp', 'image/webp', 64),
      st(110, CORPORATE_ID, ['👏'], '/reactions/clapping_hands.webp', 'image/webp', 64),
      st(111, CORPORATE_ID, ['💡'], '/reactions/light_bulb.webp', 'image/webp', 64),
    ],
  },
  {
    id: PERSONAL_ID,
    title: 'Мемы Климовича',
    scope: 'personal',
    ownerId: userIds.klimovich,
    deletedAt: null,
    stickers: [
      st(201, PERSONAL_ID, ['😅'], '/reactions/grinning_face_with_sweat.webp', 'image/webp', 64),
      st(202, PERSONAL_ID, ['🤝'], '/reactions/handshake.webp', 'image/webp', 64),
      st(
        203,
        PERSONAL_ID,
        ['😎'],
        '/reactions/smiling_face_with_sunglasses.webp',
        'image/webp',
        64,
      ),
      st(204, PERSONAL_ID, ['🤯'], '/reactions/exploding_head.webp', 'image/webp', 64),
      st(205, PERSONAL_ID, ['🫠'], '/reactions/melting_face.webp', 'image/webp', 64),
    ],
  },
  {
    // Чужой пак (не актёр): дистрибуция — стикер виден в демо-переписке,
    // получатель добавляет пак кликом по стикеру (модель Telegram/Битрикс24).
    id: FOREIGN_ID,
    title: 'Кадры',
    scope: 'personal',
    ownerId: userIds.shaiderova,
    deletedAt: null,
    stickers: [
      st(301, FOREIGN_ID, ['👀'], '/reactions/eyes.webp', 'image/webp', 64),
      st(302, FOREIGN_ID, ['🤔'], '/reactions/thinking_face.webp', 'image/webp', 64),
      st(303, FOREIGN_ID, ['🥳'], '/reactions/party_face.webp', 'image/webp', 64),
      st(304, FOREIGN_ID, ['😢'], '/reactions/crying_face.webp', 'image/webp', 64),
    ],
  },
];

/** Установки per-user (user_sticker_packs): Map<userId, Set<packId>>;
 *  демо-актёру личный пак предустановлен. */
const installs = new Map<string, Set<string>>();

function installsOf(userId: string): Set<string> {
  let set = installs.get(userId);
  if (!set) {
    set = new Set(userId === userIds.klimovich ? [PERSONAL_ID] : []);
    installs.set(userId, set);
  }
  return set;
}

/** Лимиты (спека #143): 120 стикеров в паке, 20 личных паков у сотрудника. */
export const STICKERS_PER_PACK_MAX = 120;
export const PERSONAL_PACKS_MAX = 20;

function toDto(pack: MockPack, actorId: string): StickerPack {
  return {
    id: pack.id,
    title: pack.title,
    scope: pack.scope,
    owned: pack.ownerId === actorId,
    installed: installsOf(actorId).has(pack.id),
    stickers: [...pack.stickers],
  };
}

/** Мои паки: корпоративные + свои + установленные (лёгкий список со
 *  стикерами — пилотный объём, см. комментарий в sticker.schemas.ts). */
export function listPacks(): StickerPack[] {
  const actorId = getMockActor().id;
  const installed = installsOf(actorId);
  return packs
    .filter(
      (p) =>
        !p.deletedAt && (p.scope === 'corporate' || p.ownerId === actorId || installed.has(p.id)),
    )
    .map((p) => toDto(p, actorId));
}

/** Пак по id — для поповера из чата (пак может быть не установлен). */
export function getPack(id: string): StickerPack | undefined {
  const pack = packs.find((p) => p.id === id && !p.deletedAt);
  return pack ? toDto(pack, getMockActor().id) : undefined;
}

/** Стикер по id (отправка): пак + стикер для снапшота вложения. */
export function findSticker(stickerId: string): { pack: MockPack; sticker: Sticker } | undefined {
  for (const pack of packs) {
    const sticker = pack.stickers.find((s) => s.id === stickerId);
    if (sticker && !pack.deletedAt) return { pack, sticker };
  }
  return undefined;
}

export function createPack(title: string, scope: 'corporate' | 'personal'): StickerPack {
  const actorId = getMockActor().id;
  const pack: MockPack = {
    id: crypto.randomUUID(),
    title,
    scope,
    ownerId: scope === 'corporate' ? null : actorId,
    deletedAt: null,
    stickers: [],
  };
  packs.push(pack);
  return toDto(pack, actorId);
}

/** Право управления паком: владелец; корпоративные — админ (мок актёра
 *  перmissive — право проверит живой сервер, I8 на гвардах). */
function canManage(pack: MockPack): boolean {
  return pack.ownerId === getMockActor().id || pack.scope === 'corporate';
}

export function renamePack(id: string, title: string): StickerPack | undefined {
  const pack = packs.find((p) => p.id === id && !p.deletedAt);
  if (!pack || !canManage(pack)) return undefined;
  pack.title = title;
  return toDto(pack, getMockActor().id);
}

/** Soft-delete: пак исчезает из пикеров, сообщения рендерятся дальше. */
export function deletePack(id: string): boolean {
  const pack = packs.find((p) => p.id === id && !p.deletedAt);
  if (!pack || !canManage(pack)) return false;
  pack.deletedAt = new Date().toISOString();
  return true;
}

export interface StickerUploadInput {
  file: File;
  emojis: string[];
  url: string | null;
  width: number | null;
  height: number | null;
}

/** Загрузка стикера в пак: лимит 120; формат/размер — загружающий клиент
 *  превалидирует (мок не парсит magic bytes; живой сервер — Ф2 #143). */
export function addSticker(packId: string, input: StickerUploadInput): StickerPack | undefined {
  const pack = packs.find((p) => p.id === packId && !p.deletedAt);
  if (!pack || !canManage(pack) || pack.stickers.length >= STICKERS_PER_PACK_MAX) return undefined;
  const sticker: Sticker = {
    id: crypto.randomUUID(),
    packId: pack.id,
    emojis: input.emojis,
    url: input.url ?? URL.createObjectURL(input.file),
    mime: input.file.type || 'image/png',
    size: input.file.size,
    width: input.width,
    height: input.height,
  };
  pack.stickers.push(sticker);
  return toDto(pack, getMockActor().id);
}

export function removeSticker(stickerId: string): StickerPack | undefined {
  const pack = packs.find((p) => p.stickers.some((s) => s.id === stickerId) && !p.deletedAt);
  if (!pack || !canManage(pack)) return undefined;
  pack.stickers = pack.stickers.filter((s) => s.id !== stickerId);
  return toDto(pack, getMockActor().id);
}

export function installPack(id: string): StickerPack | undefined {
  const pack = packs.find((p) => p.id === id && !p.deletedAt);
  if (!pack) return undefined;
  installsOf(getMockActor().id).add(id);
  return toDto(pack, getMockActor().id);
}

export function uninstallPack(id: string): StickerPack | undefined {
  const pack = packs.find((p) => p.id === id && !p.deletedAt);
  if (!pack) return undefined;
  installsOf(getMockActor().id).delete(id);
  return toDto(pack, getMockActor().id);
}
