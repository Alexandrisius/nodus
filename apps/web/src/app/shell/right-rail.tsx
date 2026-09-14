import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from '../../features/chat/api/chat-api.js';
import {
  conversationTitle,
  isNotesConversation,
  sortByActivity,
} from '../../features/chat/lib/conversations.js';
import { useAuthStore } from '../../shared/auth-store.js';
import { NotesGlyph } from '../../shared/ui/notes-glyph.js';
import { PersonAvatar } from '../../shared/ui/person-avatar.js';
import { useShellStore } from './shell-store.js';
import { useCardStack, useOpenCard, useReplaceTopCard } from './use-card-stack.js';

/** Ширина полосы: свёрнутая / раскрытая. Раскрытая 216px = 192 + ~12%
 *  (вердикт владельца 15.09.2026: «увеличь ширину выдвижения на 10–15%»).
 *  Экспортируется для карточек-слайдеров: их правый край = правый край
 *  мягкой рамы = левый край полосы (единая геометрия шелла). */
export const EDGE_W_COLLAPSED = 40;
export const EDGE_W_EXPANDED = 216;

/** Маркеры типа беседы на аватарках полосы УБРАНЫ (вердикт владельца
 *  15.09.2026: «закрывают почти 30 процентов аватарки»); тип читается
 *  названием и аватаркой, как в экспресс-панели Битрикс24. */
function ChatRailRow({
  conversation,
  meId,
  expanded,
  onOpen,
}: {
  conversation: ConversationListItem;
  meId: string | null | undefined;
  expanded: boolean;
  onOpen: (conversationId: string) => void;
}) {
  const notes = isNotesConversation(conversation, meId);
  const unread = conversation.unreadCount > 0 && !conversation.snoozed;

  // Tooltip — ТОЛЬКО если название не влезло в строку (вердикт владельца
  // 15.09.2026): title ставится на наведении по факту обрезки scrollWidth.
  function clippedTitle(event: React.MouseEvent<HTMLSpanElement>) {
    const el = event.currentTarget;
    el.title = el.scrollWidth > el.clientWidth ? (el.textContent ?? '') : '';
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.id)}
      className="flex w-full shrink-0 items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
    >
      <span className="relative shrink-0">
        {notes ? (
          <NotesGlyph className="size-7" />
        ) : (
          <PersonAvatar
            name={conversationTitle(conversation, meId)}
            avatarUrl={conversation.avatarUrl}
            className="size-7"
          />
        )}
        {/* Непрочитанные — МАЛЕНЬКАЯ ЦИФРА в правом нижнем углу аватарки в
            ОБЕИХ состояниях полосы (вердикт владельца 15.09.2026: «жирные
            оранжевые точки не нравятся, в Битрикс — небольшие цифры»; при
            раскрытии счётчик НЕ уезжает в квадратик справа от названия —
            остаётся на аватарке, как в свёрнутой). */}
        {unread ? (
          <span
            aria-label={`${conversation.unreadCount} ${ui.chat.unreadHint}`}
            className="absolute -right-0.5 -bottom-0.5 min-w-[11px] rounded-full bg-destructive px-[2px] text-center font-mono text-[8px] leading-[11px] font-medium text-destructive-foreground tabular-nums"
          >
            {conversation.unreadCount}
          </span>
        ) : null}
      </span>
      {/* Название — кросс-фейд max-width/opacity, как строки рейки: рефлоу
          ширины полосы идёт без рывков и обрезания текста на полуслове.
          Кегль 11px — компактнее списка мессенджера (вердикт владельца
          15.09.2026: «огромные буквы» при 13px, затем «ещё меньше» при 12px). */}
      <span
        onMouseEnter={clippedTitle}
        className={cn(
          'overflow-hidden truncate whitespace-nowrap text-[11px] text-foreground',
          'transition-[max-width,opacity] duration-200 ease-out',
          expanded ? 'max-w-44 opacity-100' : 'max-w-0 opacity-0',
        )}
      >
        {conversationTitle(conversation, meId)}
      </span>
    </button>
  );
}

/**
 * Служебная полоса = ЭКСПРЕСС-МЕССЕНДЖЕР (вердикт владельца 15.09.2026:
 * «правая панель — все чаты портала, компактный мессенджер, чтобы открывать
 * любые последние чаты поверх окон», модель правой панели Битрикс24): ВСЕ
 * беседы мессенджера КРОМЕ чатов задач (их будут тысячи), порядок — как в
 * списке мессенджера (sortByActivity: закреплённые сверху, затем по
 * активности), непрочитанные — счётчиком (свёрнуто — точкой). Клик — чат
 * КАРТОЧКОЙ поверх текущего стека (открытую чат-карточку подменяет, стек не
 * растёт). Свой СКРЫТЫЙ скролл (data-no-scrollbar, как в Битрикс: скроллбар
 * мини-панели не показывается). Профиль — в топбаре мягкой рамы справа от
 * уведомлений (ProfileMenu, вердикт 15.09.2026). Полоса живёт ЗА ПРЕДЕЛАМИ
 * мягкой рамы — в правом периметре, на его тоне и БЕЗ вертикальных границ
 * (план R3/R4). Раскрытие — КНОПКОЙ-шевронами внизу (без авто-раскрытия по
 * наведению; персистится в nodus-shell-v1): РЕФЛОУ 40 → 192px, мягкая рама
 * сужается влево синхронно; карточки держат правый край по раме
 * (slider-panel); контур перемеряется слушателем transition width
 * (circuit-frame).
 */
export function RightRail() {
  const { data } = useConversations();
  const me = useAuthStore((s) => s.user);
  const edgeOpen = useShellStore((s) => s.edgeOpen);
  const setEdgeOpen = useShellStore((s) => s.setEdgeOpen);
  const stack = useCardStack();
  const openCard = useOpenCard();
  const replaceTop = useReplaceTopCard();

  // Чат — КАРТОЧКОЙ поверх текущего стека (вердикт владельца 2026-09-14:
  // «уточнить в чате, не закрывая карточку задачи»): клик при открытой
  // чат-карточке ПОДМЕНЯЕТ её, иначе кладёт поверх.
  function showChat(conversationId: string) {
    const ref = { kind: 'chat' as const, id: conversationId };
    const top = stack[stack.length - 1];
    if (top?.kind === 'chat') replaceTop(ref);
    else openCard(ref);
  }

  function openChat(conversationId: string) {
    showChat(conversationId);
  }

  // Экспресс-лента: все беседы КРОМЕ чатов задач; закреплённые сверху, затем
  // по активности (та же сортировка, что список мессенджера).
  const chats = sortByActivity((data?.items ?? []).filter((c) => c.type !== 'task'));

  return (
    <aside
      className={cn(
        // mr-2 — щель периметра справа от полосы (8px до края вьюпорта).
        'relative mr-2 flex shrink-0 flex-col pt-2 transition-[width] duration-200 ease-out',
        edgeOpen ? 'w-54' : 'w-10',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          data-no-scrollbar
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-1 pb-1"
        >
          {chats.map((conversation) => (
            <ChatRailRow
              key={conversation.id}
              conversation={conversation}
              meId={me?.id}
              expanded={edgeOpen}
              onOpen={openChat}
            />
          ))}
        </div>
      </div>
      {/* Кнопка раскрытия/сворачивания — ВНИЗУ полосы, шевронами, как у левой
          рейки (вердикт владельца 2026-09-14: пользователь сам выбирает режим;
          зеркально рейке: раскрытие растёт ВЛЕВО — ChevronsLeft). */}
      <div className="shrink-0 p-1">
        <button
          type="button"
          onClick={() => setEdgeOpen(!edgeOpen)}
          aria-label={edgeOpen ? ui.edge.collapse : ui.edge.expand}
          className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground"
        >
          {edgeOpen ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
