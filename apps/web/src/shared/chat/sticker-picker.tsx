import { Clock, Plus } from 'lucide-react';
import { useState } from 'react';
import type { StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Spinner } from '@nodus/ui/components/spinner';
import { cn } from '@nodus/ui/lib/utils';

import {
  useCanManageStickerPacks,
  useRemoveSticker,
  useStickerPacks,
  type StickerSubmitPayload,
  buildStickerAttachment,
} from './sticker-api.js';
import { StickerCreateDialog } from './sticker-create-dialog.js';
import { StickerGlyph } from './sticker-message.js';
import { pushRecentSticker, recentStickers, type RecentSticker } from './sticker-recent.js';
import { StickerPackMenu } from './sticker-pack-menu.js';

/**
 * Вкладка «Стикеры» медиа-пикера (#143; ревизия по вердикту владельца
 * 30.09 — модель Битрикса24): ряд ВКЛАДОК ПАКОВ с обложками (первый стикер
 * пака; «Недавние» — вкладка с часами), активная вкладка открывает сетку
 * своего пака; «+» в конце ряда — создание пака (иконка без текста — место
 * дорогое). Клик по стикеру — мгновенная отправка (панель живёт, серия —
 * канон Telegram). Управление паком — «⋯» в заголовке сетки; стикер из
 * СВОЕГО/корпоративного пака убирается правым кликом по ячейке.
 * Деградация без бэкенда (Ф1→Ф2): ошибка загрузки = заглушка «появятся
 * после обновления сервера», а не мёртвая панель.
 */

const RECENT_TAB = 'recent';

export function StickerPanel({
  onPick,
  disabled = false,
}: {
  onPick: (payload: StickerSubmitPayload) => void;
  /** Нет права поста/режим селекта/пересылки — отправка запрещена. */
  disabled?: boolean;
}) {
  const packsQuery = useStickerPacks();
  const [recent, setRecent] = useState<RecentSticker[]>(() => recentStickers());
  const [createOpen, setCreateOpen] = useState(false);
  const [appendTo, setAppendTo] = useState<StickerPack | null>(null);
  const [activeId, setActiveId] = useState<string | typeof RECENT_TAB>(RECENT_TAB);

  const packs = packsQuery.data?.items ?? [];
  const corporate = packs.filter((p) => p.scope === 'corporate');
  const personal = packs.filter((p) => p.scope !== 'corporate');
  const ordered = [...corporate, ...personal];
  // «Недавние» живы, пока их стикеры есть в доступных пакетах (soft-delete
  // пака чистит список) — id-фильтр по актуальному набору.
  const aliveIds = new Set(packs.flatMap((p) => p.stickers.map((s) => s.id)));
  const recentAlive = recent.filter((r) => aliveIds.has(r.id));

  // Активная вкладка: выбранный пак; если его больше нет (удалили) — первый.
  const activePack = ordered.find((p) => p.id === activeId);
  const effectiveTab: string = activePack ? activePack.id : (ordered[0]?.id ?? RECENT_TAB);

  function openCreate(target: StickerPack | null) {
    setAppendTo(target);
    setCreateOpen(true);
  }

  function pickPackSticker(pack: StickerPack, stickerId: string) {
    if (disabled) return;
    const sticker = pack.stickers.find((s) => s.id === stickerId);
    if (!sticker) return;
    pushRecentSticker(sticker, pack);
    setRecent(recentStickers());
    onPick({ stickerId, attachment: buildStickerAttachment(sticker, sticker.emojis, pack) });
  }

  function pickRecentSticker(entry: RecentSticker) {
    if (disabled) return;
    onPick({
      stickerId: entry.id,
      attachment: buildStickerAttachment(entry, entry.emojis, {
        id: entry.packId,
        title: entry.packTitle,
        scope: entry.packScope,
      }),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Ряд вкладок паков (Битрикс24): обложка = первый стикер пака. */}
      <div
        role="tablist"
        aria-label={ui.chat.stickerTab}
        className="flex shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-border px-2 py-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTab === RECENT_TAB}
          title={ui.chat.stickerRecentTab}
          aria-label={ui.chat.stickerRecentTab}
          onClick={() => setActiveId(RECENT_TAB)}
          className={cn(
            'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors',
            effectiveTab === RECENT_TAB
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <Clock className="size-4" strokeWidth={1.75} />
        </button>
        {ordered.map((pack) => {
          const cover = pack.stickers[0];
          const active = effectiveTab === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={pack.title}
              aria-label={pack.title}
              onClick={() => setActiveId(pack.id)}
              className={cn(
                'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg p-0.5 transition-colors',
                active ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              {cover ? (
                <StickerGlyph
                  url={cover.url}
                  mime={cover.mime}
                  alt={pack.title}
                  className="size-7 rounded-md object-contain"
                />
              ) : (
                <span className="text-label-xs text-muted-foreground">
                  {pack.title.slice(0, 2)}
                </span>
              )}
            </button>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label={ui.chat.stickerCreatePack}
          title={ui.chat.stickerCreatePack}
          disabled={disabled}
          onClick={() => openCreate(null)}
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
      {/* Сетка активной вкладки — фиксированная зона (габарит не прыгает). */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {packsQuery.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground">
            {ui.chat.stickerServerPending}
          </div>
        ) : packsQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Spinner className="mr-2 size-4" />
            {ui.chat.stickerLoading}
          </div>
        ) : packs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <span>{ui.chat.stickerEmpty}</span>
            <Button type="button" size="sm" disabled={disabled} onClick={() => openCreate(null)}>
              {ui.chat.stickerCreatePack}
            </Button>
          </div>
        ) : effectiveTab === RECENT_TAB ? (
          recentAlive.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {ui.chat.stickerRecentTab}
            </div>
          ) : (
            <div
              className={cn('grid grid-cols-4 gap-1', disabled && 'pointer-events-none opacity-50')}
            >
              {recentAlive.map((entry) => (
                <button
                  key={`recent:${entry.id}`}
                  type="button"
                  aria-label={entry.packTitle}
                  title={entry.packTitle}
                  onClick={() => pickRecentSticker(entry)}
                  className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-transform hover:scale-110 hover:bg-accent"
                >
                  <StickerGlyph
                    url={entry.url}
                    mime={entry.mime}
                    alt={entry.packTitle}
                    className="size-14 object-contain"
                  />
                </button>
              ))}
            </div>
          )
        ) : activePack ? (
          <PackGrid
            pack={activePack}
            disabled={disabled}
            onPick={pickPackSticker}
            onAppend={openCreate}
          />
        ) : null}
      </div>
      {createOpen ? (
        <StickerCreateDialog open onOpenChange={setCreateOpen} appendTo={appendTo} />
      ) : null}
    </div>
  );
}

/** Сетка одного пака: заголовок с меню управления + ячейки; ПКМ по ячейке
 *  управляемого пака (свой/корпоративный с правом) — «Убрать из пака»
 *  (модель Битрикс24). */
function PackGrid({
  pack,
  disabled,
  onPick,
  onAppend,
}: {
  pack: StickerPack;
  disabled: boolean;
  onPick: (pack: StickerPack, stickerId: string) => void;
  onAppend: (pack: StickerPack) => void;
}) {
  const canManage = useCanManageStickerPacks();
  const manageable = pack.owned || (pack.scope === 'corporate' && canManage);
  const remove = useRemoveSticker();
  const [menuStickerId, setMenuStickerId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <h3 className="flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground">
        <span className="truncate" title={pack.title}>
          {pack.title}
        </span>
        <span className="font-mono text-label-xs tabular-nums">{pack.stickers.length}</span>
        <span className="ml-auto flex items-center">
          <StickerPackMenu pack={pack} onAppend={onAppend} />
        </span>
      </h3>
      {pack.stickers.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          {ui.chat.stickerPackEmpty}
        </div>
      ) : (
        <div className={cn('grid grid-cols-4 gap-1', disabled && 'pointer-events-none opacity-50')}>
          {pack.stickers.map((sticker) => (
            <span key={sticker.id} className="relative">
              <button
                type="button"
                aria-label={`${pack.title}: ${sticker.emojis.join(' ')}`}
                title={
                  manageable
                    ? `${sticker.emojis.join(' ')} · ${ui.chat.stickerRemoveFromPack} — правый клик`
                    : sticker.emojis.join(' ')
                }
                onClick={() => onPick(pack, sticker.id)}
                onContextMenu={
                  manageable
                    ? (event) => {
                        event.preventDefault();
                        setMenuStickerId((prev) => (prev === sticker.id ? null : sticker.id));
                      }
                    : undefined
                }
                className="flex w-full cursor-pointer items-center justify-center rounded-lg p-1 transition-transform hover:scale-110 hover:bg-accent"
              >
                <StickerGlyph
                  url={sticker.url}
                  mime={sticker.mime}
                  alt={sticker.emojis.join(' ')}
                  className="size-14 object-contain"
                />
              </button>
              {menuStickerId === sticker.id ? (
                <span className="absolute top-1 right-1 z-10 flex flex-col rounded-lg border border-border bg-card p-1 shadow-sm">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md px-2 py-1 text-xs text-destructive hover:bg-accent"
                    onClick={() => {
                      remove.mutate(sticker.id);
                      setMenuStickerId(null);
                    }}
                  >
                    {ui.chat.stickerRemoveFromPack}
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    onClick={() => setMenuStickerId(null)}
                  >
                    {ui.common.cancel}
                  </button>
                </span>
              ) : null}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
