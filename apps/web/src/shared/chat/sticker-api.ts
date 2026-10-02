import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStickerPackBody,
  MessageAttachment,
  RenameStickerPackBody,
  Sticker,
  StickerPack,
  StickerPackList,
  StickerPackScope,
} from '@nodus/contracts';
import { Permission, ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api, apiUpload } from '../api-client.js';
import { useAuthStore } from '../auth-store.js';
import { chatKeys, useSendChatMessage } from './api.js';
import { pushRecentSticker } from './sticker-recent.js';

/**
 * API-слой стикеров (#143, Ф1 — моки, Ф2 — живой REST): паки, установка,
 * загрузка стикеров. Ключи — под префиксом chat (общая инвалидация домена);
 * установка/снятие пака — оптимистичный toggle (I4, мгновенный отклик).
 */

export const stickerKeys = {
  all: [...chatKeys.all, 'stickers'] as const,
  packs: () => [...stickerKeys.all, 'packs'] as const,
  pack: (id: string) => [...stickerKeys.all, 'packs', id] as const,
};

/** Право управления корпоративными паками (I8): UI лишь прячет недоступное,
 *  гейт — на сервере. Живой вход — JWT-permissions; мок-режим — демо-актёр
 *  «админ» (мок-концепт users.ts). */
export function useCanManageStickerPacks(): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (permissions ?? []).includes(Permission.STICKER_MANAGE);
}

/** Мои паки: корпоративные + свои + установленные (со стикерами — пилотный
 *  объём; см. комментарий к stickerPackSchema в contracts). */
export function useStickerPacks() {
  return useQuery({
    queryKey: stickerKeys.packs(),
    queryFn: () => api<StickerPackList>('/chat/stickers/packs'),
  });
}

/** Деталь пака — поповер из чата: пак может быть не в «моих». */
export function useStickerPack(id: string) {
  return useQuery({
    queryKey: stickerKeys.pack(id),
    queryFn: () => api<StickerPack>(`/chat/stickers/packs/${id}`),
    enabled: id.length > 0,
    // 404 удалённого пака — легитимное состояние окна, не сетевая морока:
    // ретраи держат окно со СТАРЫМИ данными секунды (ревизия 30.09).
    retry: false,
  });
}

/** Единая правка кэша пака (оптимистичность мутаций состава/названия). */
function setPackInCache(queryClient: ReturnType<typeof useQueryClient>, next: StickerPack): void {
  queryClient.setQueryData<StickerPackList>(stickerKeys.packs(), (old) =>
    old
      ? {
          items: old.items.some((p) => p.id === next.id)
            ? old.items.map((p) => (p.id === next.id ? next : p))
            : [...old.items, next],
        }
      : old,
  );
  queryClient.setQueryData(stickerKeys.pack(next.id), next);
}

export function useCreateStickerPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStickerPackBody) =>
      api<StickerPack>('/chat/stickers/packs', { method: 'POST', body }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stickerKeys.packs() }),
  });
}

export function useRenameStickerPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { packId: string; body: RenameStickerPackBody }) =>
      api<StickerPack>(`/chat/stickers/packs/${target.packId}`, {
        method: 'PATCH',
        body: target.body,
      }),
    onSuccess: (pack) => setPackInCache(queryClient, pack),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stickerKeys.packs() }),
  });
}

/** «Удалить для всех» (soft): владелец/админ; сообщения рендерятся дальше.
 *  Деталь пака инвалидируется сразу: открытое окно честно переходит в
 *  деградацию «Пак удалён», а не продолжает показывать старые данные. */
export function useDeleteStickerPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packId: string) =>
      api<void>(`/chat/stickers/packs/${packId}`, { method: 'DELETE' }),
    onSuccess: (_result, packId) => {
      queryClient.removeQueries({ queryKey: stickerKeys.pack(packId) });
      queryClient.setQueryData<StickerPackList>(stickerKeys.packs(), (old) =>
        old ? { items: old.items.filter((p) => p.id !== packId) } : old,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stickerKeys.packs() }),
  });
}

/** Загрузка стикера (multipart; вне хука — пак может быть только что
 *  создан): текстовые поля ДО файла (контракт @fastify/multipart — gotcha
 *  #57); previewUrl/габариты — клиентские подсказки (мок-соглашение
 *  /chat/attachments; живой сервер выдаёт url из хранилища и сверяет байты).
 *  Инвалидацию делает вызывающий (диалог загружает серию). */
export async function uploadStickerFile(
  packId: string,
  input: {
    file: File;
    emojis: string[];
    previewUrl: string;
    width: number | null;
    height: number | null;
  },
): Promise<StickerPack> {
  const form = new FormData();
  form.append('emojis', JSON.stringify(input.emojis));
  form.append('size', String(input.file.size));
  form.append('previewUrl', input.previewUrl);
  if (input.width != null) form.append('width', String(input.width));
  if (input.height != null) form.append('height', String(input.height));
  form.append('file', input.file);
  return apiUpload<StickerPack>(`/chat/stickers/packs/${packId}/stickers`, form, {
    // Полумок (chat живой при активном MSW): мимо перехватчика (#57).
    mswBypassIfLive: 'chat',
  });
}

export function useRemoveSticker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stickerId: string) =>
      api<StickerPack>(`/chat/stickers/stickers/${stickerId}`, { method: 'DELETE' }),
    onSuccess: (pack) => setPackInCache(queryClient, pack),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stickerKeys.packs() }),
  });
}

/** Оптимистичный toggle установки пака «себе» (общая механика для install/
 *  uninstall): мгновенный флаг в кэше, откат + тост при ошибке (I4). */
function usePackInstallMutation(method: 'POST' | 'DELETE', installed: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (packId: string) =>
      api<StickerPack>(`/chat/stickers/packs/${packId}/install`, { method }),
    onMutate: async (packId) => {
      await queryClient.cancelQueries({ queryKey: stickerKeys.packs() });
      const previous = queryClient.getQueryData<StickerPackList>(stickerKeys.packs());
      queryClient.setQueryData<StickerPackList>(stickerKeys.packs(), (old) =>
        old
          ? {
              items: old.items.map((p) => (p.id === packId ? { ...p, installed } : p)),
            }
          : old,
      );
      return { previous };
    },
    onError: (_error, _packId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(stickerKeys.packs(), context.previous);
        toast.error(ui.common.sendError);
      }
    },
    onSuccess: (pack) => setPackInCache(queryClient, pack),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: stickerKeys.packs() }),
  });
}

export function useInstallStickerPack() {
  return usePackInstallMutation('POST', true);
}

export function useUninstallStickerPack() {
  return usePackInstallMutation('DELETE', false);
}

/** Payload выбора стикера (панель/поповер → композер): id для отправки +
 *  готовое превью-вложение для оптимистичного temp-сообщения (I4). */
export interface StickerSubmitPayload {
  stickerId: string;
  attachment: MessageAttachment;
}

interface StickerSourceMeta {
  id: string;
  url: string;
  mime: string;
  size?: number;
  width: number | null;
  height: number | null;
}

interface StickerPackMeta {
  id: string;
  title: string;
  scope: StickerPackScope;
}

/** Снапшот-вложение kind='sticker' (для temp-сообщения клиента; сервер
 *  строит своё в транзакции отправки — Ф2 #143). */
export function buildStickerAttachment(
  sticker: StickerSourceMeta,
  emojis: string[],
  pack: StickerPackMeta,
): MessageAttachment {
  const ext = sticker.mime.split('/')[1] ?? 'png';
  return {
    id: crypto.randomUUID(),
    fileId: sticker.id,
    name: `sticker.${ext}`,
    size: sticker.size ?? 0,
    mime: sticker.mime,
    kind: 'sticker',
    url: sticker.url,
    thumbnailUrl: null,
    previewKind: 'image',
    pdfUrl: null,
    width: sticker.width,
    height: sticker.height,
    sticker: { packId: pack.id, packTitle: pack.title, packScope: pack.scope, emojis },
  };
}

/** Отправка стикера «напрямую» (поповер пака в сообщении): тот же
 *  оптимистичный конвейер useSendChatMessage; keepDraft — стикер не съедает
 *  набранный текст композера (аудит #123: потерь текста нет). */
export function useSendSticker(conversationId: string) {
  const send = useSendChatMessage(conversationId);
  return (pack: StickerPack, sticker: Sticker, threadRootId: string | null): void => {
    pushRecentSticker(sticker, pack);
    send.mutate({
      text: '',
      stickerId: sticker.id,
      attachments: [buildStickerAttachment(sticker, sticker.emojis, pack)],
      threadRootId,
      keepDraft: true,
    });
  };
}
