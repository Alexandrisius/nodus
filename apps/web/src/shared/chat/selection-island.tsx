import { Copy, Forward, Star, Trash2, X } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { useAddFavorites } from './favorites-api.js';
import { useCanModerateMessages } from './use-can-moderate.js';

/** Режим мультивыбора ленты (A6): композер СХЛОПЫВАЕТСЯ в узкий островок
 *  батч-команд (модель Bitrix24, вердикт 24.09: ввод в селекте не нужен,
 *  верхняя полоса двигала UI). Действия собирает хост (use-feed-selection).
 *  Дом — модуль селекта (I5-сплит из chat-composer.tsx, #294). */
export interface ComposerSelection {
  count: number;
  /** Выделенные id в порядке ленты (#171: порядок цепочки = порядок «Заметок»). */
  ids: string[];
  allMine: boolean;
  /** В выделении есть ещё не подтверждённые отправки (#243): серверные
   *  команды (переслать/звезда/удалить) серые до подтверждения очереди —
   *  без уведомлений, гри-аут как в Telegram (вердикт владельца 07.10). */
  pending?: boolean;
  /** Корзина доступна, когда всё выделенное можно удалить: в обычных лентах
   *  это «все свои» (allMine, tdesktop); витрина «Избранного» удаляет ЛЮБУЮ
   *  строку (запись — удалить, карточку — снять звезду, #215). */
  deletable?: boolean;
  /** Витрина «Избранного» (#215): пересылка островка — только записи (id
   *  карточек живут в чужих беседах, сервер форварда ищет источники в одной
   *  беседе-источнике; карточка пересылается ПКМ из исходной беседы).
   *  false — кнопки «Переслать» нет. */
  forwardable?: boolean;
  /** Витрина «Заметок»: звезда-цепочка скрыта (self-reference, #171). */
  favoritesEnabled?: boolean;
  onForward: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClear: () => void;
}

/**
 * Тулбар узкого островка батч-команд (A6, #87; вердикт 24.09): композер в
 * селекте сужается до него, ввод не нужен. «Переслать» — ТЕКСТОМ (самая
 * популярная команда очевидна), звезда-цепочка (#171, «В избранное») /
 * корзина (все свои ИЛИ право модерации #245 — админ беседы/модератор
 * портала удаляют и чужие) / копировать / выход — значками. frozen —
 * фаза выхода из селекта: островок ещё расширяется, кнопки уже не кликаются
 * (pointer-events-none).
 */
export function SelectionToolbar({
  sel,
  frozen,
  conversationId,
}: {
  sel: ComposerSelection;
  frozen: boolean;
  /** Беседа ленты-хоста: право модерации открывает корзину на чужих (#245). */
  conversationId?: string;
}) {
  const addFavorites = useAddFavorites();
  const canModerate = useCanModerateMessages(conversationId ?? '');
  return (
    <span
      role="toolbar"
      data-testid="selection-bar"
      aria-label={`${ui.chat.selectedPrefix} ${sel.count}`}
      className={cn('flex w-full items-center gap-0.5', frozen && 'pointer-events-none')}
    >
      <span className="px-1.5 font-mono text-label-sm text-muted-foreground tabular-nums">
        {sel.count}
      </span>
      {sel.forwardable !== false ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 text-muted-foreground"
          aria-label={ui.chat.menu.forward}
          title={ui.chat.menu.forward}
          disabled={sel.pending}
          onClick={sel.onForward}
        >
          <Forward className="size-4" strokeWidth={1.75} />
          {ui.chat.menu.forward}
        </Button>
      ) : null}
      {sel.favoritesEnabled !== false ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={ui.chat.favoriteSelected}
          title={ui.chat.favoriteSelected}
          disabled={sel.pending}
          onClick={() => {
            // Порядок цепочки = порядок выделения в ленте → поток «Избранного».
            addFavorites.mutate(sel.ids);
            sel.onClear();
          }}
        >
          <Star className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
      {(sel.deletable ?? (sel.allMine || canModerate)) ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label={ui.chat.menu.delete}
          title={ui.chat.menu.delete}
          disabled={sel.pending}
          onClick={sel.onDelete}
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground"
        aria-label={ui.chat.menu.copy}
        title={ui.chat.menu.copy}
        onClick={sel.onCopy}
      >
        <Copy className="size-4" strokeWidth={1.75} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto shrink-0 text-muted-foreground"
        aria-label={ui.chat.clearSelection}
        title={ui.chat.clearSelection}
        onClick={sel.onClear}
      >
        <X className="size-4" strokeWidth={1.75} />
      </Button>
    </span>
  );
}
