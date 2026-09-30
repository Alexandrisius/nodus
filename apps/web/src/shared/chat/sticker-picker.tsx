import { Clock, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { StickerPack } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { Spinner } from '@nodus/ui/components/spinner';
import { cn } from '@nodus/ui/lib/utils';

import {
  useCanManageStickerPacks,
  useRemoveSticker,
  useStickerPacks,
  type StickerSubmitPayload,
  buildStickerAttachment,
} from './sticker-api.js';
import { StickerGlyph } from './sticker-message.js';
import { pushRecentSticker, recentStickers, type RecentSticker } from './sticker-recent.js';
import { StickerPackMenu, type PackDialogRequest } from './sticker-pack-menu.js';

/**
 * Вкладка «Стикеры» медиа-пикера (#143; модель Битрикс24 — вердикт владельца
 * 30.09): ЕДИНЫЙ прокручиваемый список — «Недавние» (12 последних) сверху,
 * ниже подряд все паки портала. Ряд вкладок с обложками СИНХРОНЕН прокрутке:
 * секция у верхней кромки подсвечивает свою вкладку; клик по вкладке
 * проматывает список к паку. Клик по стикеру — мгновенная отправка (панель
 * живёт, серия — канон Telegram); ПКМ по ячейке управляемого пака —
 * «Убрать из пака» (компактный попап реакций). «+» — создание пака.
 * Деградация без бэкенда: заглушка «появятся после обновления сервера».
 */

const RECENT_TAB = 'recent';

export function StickerPanel({
  onPick,
  onHostDialog,
  disabled = false,
}: {
  onPick: (payload: StickerSubmitPayload) => void;
  /** Тяжёлые окна (создание/переименование/удаление) хост рендерит ВНЕ
   *  поповера панели: клик мимо закрывает поповер и уносит потомков (репро
   *  30.09 — «диалог всё равно закрывается»); панель только просит. */
  onHostDialog: (request: PackDialogRequest) => void;
  /** Нет права поста/режим селекта/пересылки — отправка запрещена. */
  disabled?: boolean;
}) {
  const packsQuery = useStickerPacks();
  const [recent, setRecent] = useState<RecentSticker[]>(() => recentStickers());
  // Активная вкладка — ВИЗУАЛЬНЫЙ синхрон прокрутки (не фильтр списка).
  const [activeId, setActiveId] = useState<string>(RECENT_TAB);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const packs = packsQuery.data?.items ?? [];
  const corporate = packs.filter((p) => p.scope === 'corporate');
  const personal = packs.filter((p) => p.scope !== 'corporate');
  const ordered = [...corporate, ...personal];
  // «Недавние» живы, пока их стикеры есть в доступных пакетах (soft-delete
  // пака чистит список) — id-фильтр по актуальному набору.
  const aliveIds = new Set(packs.flatMap((p) => p.stickers.map((s) => s.id)));
  const recentAlive = recent.filter((r) => aliveIds.has(r.id));
  const hasRecent = recentAlive.length > 0;

  const sectionIds = [...(hasRecent ? [RECENT_TAB] : []), ...ordered.map((p) => p.id)];

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

  /** Синхрон вкладок: секция у верхней кромки скроллера — активная; в ДОНЫШКЕ
   *  списка активна последняя секция (она физически не достаёт до кромки —
   *  клик по её вкладке обязан её подсветить, модель Битрикс24). */
  function syncActiveOnScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const last = sectionIds[sectionIds.length - 1];
    if (
      last !== undefined &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4
    ) {
      setActiveId(last);
      return;
    }
    const top = scroller.scrollTop + 8;
    let current: string | null = null;
    for (const id of sectionIds) {
      const el = sectionRefs.current.get(id);
      if (el && el.offsetTop <= top) current = id;
    }
    if (current !== null) setActiveId(current);
  }

  /** Клик по вкладке — промотать единый список к секции пака (Битрикс24). */
  function selectTab(id: string) {
    setActiveId(id);
    const scroller = scrollerRef.current;
    const el = sectionRefs.current.get(id);
    if (!scroller) return;
    scroller.scrollTo({ top: el ? el.offsetTop - 4 : 0, behavior: 'smooth' });
  }

  function registerSection(id: string, el: HTMLElement | null) {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Ряд вкладок паков: обложка = первый стикер; синхронен прокрутке. */}
      <div
        role="tablist"
        aria-label={ui.chat.stickerTab}
        className="flex shrink-0 items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-border px-2 py-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeId === RECENT_TAB}
          title={ui.chat.stickerRecentTab}
          aria-label={ui.chat.stickerRecentTab}
          onClick={() => selectTab(RECENT_TAB)}
          className={cn(
            'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors',
            activeId === RECENT_TAB
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <Clock className="size-4" strokeWidth={1.75} />
        </button>
        {ordered.map((pack) => {
          const cover = pack.stickers[0];
          const active = activeId === pack.id;
          return (
            <button
              key={pack.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={pack.title}
              aria-label={pack.title}
              onClick={() => selectTab(pack.id)}
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
          onClick={() => onHostDialog({ kind: 'create' })}
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
      {/* Единый список: «Недавние» + все паки подряд (модель Битрикс24). */}
      <div
        ref={scrollerRef}
        onScroll={syncActiveOnScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
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
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onHostDialog({ kind: 'create' })}
            >
              {ui.chat.stickerCreatePack}
            </Button>
          </div>
        ) : (
          <>
            {hasRecent ? (
              <section
                ref={(el) => registerSection(RECENT_TAB, el)}
                className="flex flex-col gap-1 pb-2"
              >
                <SectionTitle>{ui.chat.stickerRecentTab}</SectionTitle>
                <div
                  className={cn(
                    'grid grid-cols-4 gap-1',
                    disabled && 'pointer-events-none opacity-50',
                  )}
                >
                  {recentAlive.map((entry) => (
                    <button
                      key={`recent:${entry.id}`}
                      type="button"
                      aria-label={entry.packTitle}
                      title={entry.packTitle}
                      onClick={() => pickRecentSticker(entry)}
                      className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-colors hover:bg-accent"
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
              </section>
            ) : null}
            {ordered.map((pack) => (
              <section
                key={pack.id}
                ref={(el) => registerSection(pack.id, el)}
                className="flex flex-col gap-1 pb-2"
              >
                <SectionTitle>
                  <span className="min-w-0 truncate" title={pack.title}>
                    {pack.title}
                  </span>
                  <span className="ml-auto flex items-center">
                    <StickerPackMenu pack={pack} onDialog={onHostDialog} />
                  </span>
                </SectionTitle>
                {pack.stickers.length === 0 ? (
                  <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
                    {ui.chat.stickerPackEmpty}
                  </div>
                ) : (
                  <PackCells pack={pack} disabled={disabled} onPick={pickPackSticker} />
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Заголовок секции единого списка: название + «⋯» управления (без счётчика —
 *  ревизия 30.09: «некрасиво и ненужно»). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

/** Ячейки пака: клик — отправка; ПКМ по управляемому паку — мини-меню
 *  «Убрать из пака» (компактный попап реакций — не узкий кастом). */
function PackCells({
  pack,
  disabled,
  onPick,
}: {
  pack: StickerPack;
  disabled: boolean;
  onPick: (pack: StickerPack, stickerId: string) => void;
}) {
  const canManage = useCanManageStickerPacks();
  const manageable = pack.owned || (pack.scope === 'corporate' && canManage);
  const remove = useRemoveSticker();
  const [menuStickerId, setMenuStickerId] = useState<string | null>(null);

  return (
    <div className={cn('grid grid-cols-4 gap-1', disabled && 'pointer-events-none opacity-50')}>
      {pack.stickers.map((sticker) => {
        const menuOpen = menuStickerId === sticker.id;
        return (
          <Popover
            key={sticker.id}
            open={menuOpen}
            onOpenChange={(open) => setMenuStickerId(open ? sticker.id : null)}
          >
            <PopoverAnchor asChild>
              <button
                type="button"
                aria-label={`${pack.title}: ${sticker.emojis.join(' ')}`}
                title={
                  manageable
                    ? `${sticker.emojis.join(' ')} · ${ui.chat.stickerRemoveHint}`
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
                className="flex cursor-pointer items-center justify-center rounded-lg p-1 transition-colors hover:bg-accent"
              >
                <StickerGlyph
                  url={sticker.url}
                  mime={sticker.mime}
                  alt={sticker.emojis.join(' ')}
                  className="size-14 object-contain"
                />
              </button>
            </PopoverAnchor>
            {manageable ? (
              <PopoverContent
                side="top"
                align="start"
                className="w-max min-w-44 p-1"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-1 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    remove.mutate(sticker.id);
                    setMenuStickerId(null);
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                  {ui.chat.stickerRemoveFromPack}
                </button>
              </PopoverContent>
            ) : null}
          </Popover>
        );
      })}
    </div>
  );
}
