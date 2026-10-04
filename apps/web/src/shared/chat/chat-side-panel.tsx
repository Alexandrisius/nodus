import { ArrowLeft, FileText, Link2, PanelRight, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { threadScopeMessages } from './channel-layout.js';
import { ChatSearchPanel } from './chat-search-panel.js';
import { useConversationMessages } from './api.js';
import { isNotesConversation } from './conversations.js';
import { ConversationMembersPanel } from './conversation-members.js';
import { FavoriteHitRow } from './favorite-hit-row.js';
import { useFavorites } from './favorites-api.js';
import { useJumpStore } from './jump-store.js';
import { formatDayLabel } from './message-groups.js';

import { useAuthStore } from '../auth-store.js';
import { useFrameReady } from '../ui/use-frame-ready.js';
import { uiPx } from '../ui/ui-scale.js';
import { useViewerStore } from '../files/viewer-store.js';

/** Ширина вталкивающей панели беседы: контейнер уменьшает чат на неё. */
export const CHAT_PANEL_W = uiPx(300);

/** Минимум ЛЕНТЫ при открытой панели (вердикт владельца: 280 — «слишком
 *  малая») и соответствующий минимум всей колонки чата. */
export const MIN_FEED_WITH_PANEL = uiPx(360);
export const MIN_COLUMN_WITH_PANEL = MIN_FEED_WITH_PANEL + CHAT_PANEL_W;

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h4 className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <NodeLabel label={title} />
      </h4>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Состояние панели беседы: обёртка монтируется СРАЗУ и ПОСТОЯННО (w-0), а
 * контент — лениво на первом открытии и далее остаётся (приём обёртки
 * панели «О задаче»: первый тоггл не платит маунтом панели и данных в
 * кадрах анимации — рывка нет, баг-вердикт владельца 15.09.2026).
 */
export function useChatSidePanel() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, toggle, close };
}

/**
 * ЗАКОН (вердикт владельца 2026-09-11): где чат — там правая панель с
 * файлами и ссылками беседы. Канон — панель «О задаче»: ВТАЛКИВАЮЩАЯ
 * колонка справа (не оверлей — композер и лента доступны), тоггл — кнопка
 * СПРАВА ВВЕРХУ в шапке беседы (её рисует контейнер: страница мессенджера
 * или колонка чата карточки). Панель двигает область чата; когда чат уже на
 * минимальной ширине — выталкивает левую часть (auto-колонки grid).
 * В карточке задачи её роль играет панель «О задаче» (те же секции +
 * история и избранное).
 *
 * Панель — ОДНА на беседу (хостится контейнером), НЕ на зону: окно треда
 * рядом с лентой (#42) не умножает правых панелей (research OpenClaw:
 * несколько rail'ов съедают ширину ленты и множат границы ресайза). При
 * открытом треде — переключатель области «Вся беседа / Этот тред» (канон
 * пресетов: 13px, зона bg-muted/40, активный bg-accent): файлы/ссылки
 * фильтруются по корню треда и его ответам.
 *
 * ГЕОМЕТРИЯ (вердикт владельца 15.09.2026, рефы Битрикс24): панель —
 * ПОЛНОВЫСОТНАЯ колонка-сиблинг всего контента хоста: занимает ВЕРХНИЙ БАР
 * тоже. Её верхняя строка (высотой в бар хоста, `headerClass`) = название
 * панели («О чате»/«О канале»/«О проекте») СЛЕВА + крестик У САМОГО КРАЯ
 * справа; никаких внутренних перегородок в баре. Кнопка-тоггл остаётся в
 * баре беседы и уезжает ВЛЕВО при раскрытии (бар хоста сужается панелью).
 *
 * ПЕРВОЕ открытие — ПЛАВНОЕ (баг-вердикт владельца 15.09.2026): панель
 * монтируется в момент первого открытия, свежему элементу transition идти
 * неоткуда — появлялась рывком. Монтируем в покое (w-0) и раскрываем классом
 * ПОСЛЕ двух кадров (`useFrameReady`) — transition стартует с первого кадра.
 */
export function ChatSidePanel({
  conversationId,
  conversation,
  open,
  onClose,
  title,
  headerClass = 'h-14',
  threadRootId = null,
  view = 'files',
  onMembersClose,
  onSearchBack,
  onAddMembers,
}: {
  conversationId: string;
  /** Беседа для вида «Участники» (#186): роли и права матрицы. */
  conversation?: ConversationListItem;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Высота верхней строки панели = высота верхнего бара хоста (линии
   *  border-b продолжаются друг в друга). */
  headerClass?: string;
  threadRootId?: string | null;
  /** Вид колонки (#186 + поиск 04.10): файлы/ссылки («О чате»), участники —
   *  панель участников стоит РОВНО ПОВЕРХ тоггл-панели (та же колонка 1:1),
   *  поиск — лупа в шапке беседы раскрывает ту же панель с поисковой
   *  строкой и топ-выдачей (модель Битрикс24, вердикт владельца 04.10). */
  view?: 'files' | 'members' | 'search';
  /** Выход из вида участников: назад к файлам (если панель была открыта)
   *  или свернуть колонку — решает хост. */
  onMembersClose?: () => void;
  /** Выход из вида поиска «назад» — к панели вложений (колонка открыта). */
  onSearchBack?: () => void;
  /** Открыть окно добавления участников (кнопка «Добавить»). */
  onAddMembers?: () => void;
}) {
  const { data } = useConversationMessages(conversationId);
  const meId = useAuthStore((s) => s.user?.id ?? null);
  // Витрина «Избранного»: своих звёзд в ней нет — вкладка скрыта (04.10 р.5).
  const isNotes = Boolean(conversation && isNotesConversation(conversation, meId));
  const [scope, setScope] = useState<'all' | 'thread'>('all');
  // Вкладка панели (#171): файлы/ссылки ↔ избранное ЭТОЙ беседы — витрина
  // карточек + снятие звезды + прыжок к оригиналу (битриксовская модель).
  const [tab, setTab] = useState<'files' | 'favorites'>('files');
  const favoritesQuery = useFavorites({ conversationId });
  // Плавное ПЕРВОЕ открытие: монтируемся в покое (w-0), класс раскрытия —
  // после двух кадров (useFrameReady), transition идёт с первого кадра.
  const ready = useFrameReady();
  // Контент (файлы/избранное/поиск) монтируется ВМЕСТЕ с панелью — ещё в
  // свёрнутом виде: НИ один выезд колонки не платит маунтом в кадрах
  // анимации (ленивый маунт первого открытия давал «гармошку» выезда,
  // 04.10 р.6; обёртка в DOM постоянна — приём панели «О задаче»).
  const columnOpen = open || view !== 'files';
  useEffect(() => {
    if (!threadRootId) setScope('all');
  }, [threadRootId]);
  const items = data?.items ?? [];
  const scoped =
    threadRootId && scope === 'thread' ? threadScopeMessages(items, threadRootId) : items;
  const files = scoped.flatMap((m) => m.attachments);
  const openViewer = useViewerStore((s) => s.open);
  const links = scoped.flatMap((m) => m.text.match(/https?:\/\/\S+/g) ?? []);

  return (
    <div
      aria-hidden={!columnOpen}
      inert={!columnOpen}
      className={cn(
        'h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
        columnOpen && ready ? 'w-[18.75rem]' : 'w-0',
      )}
    >
      <aside className="flex h-full w-[18.75rem] flex-col border-l border-border bg-card">
        {/* Верхняя строка панели — НА УРОВНЕ бара хоста: название слева,
            крестик у самого правого края (реф Битрикс24, вердикт владельца
            15.09.2026); border-b продолжает линию бара хоста. Вид участников
            (#186): у края СЛЕВА стрелка «назад», если под ним открыта панель
            «О чате» (возврат к файлам), иначе крестик (свернуть колонку).
            Вид поиска (04.10, раунд 4): строки НЕТ — шапку рисует сам поиск
            (крестик/«назад» + строка-пилюля, реф Битрикс24). */}
        {view !== 'search' ? (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b border-border px-3',
              headerClass,
            )}
          >
            {view === 'members' ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 hover:bg-accent"
                onClick={onMembersClose ?? onClose}
                aria-label={open ? ui.chat.membersBack : ui.common.close}
                title={open ? ui.chat.membersBack : ui.common.close}
              >
                {open ? <ArrowLeft /> : <X />}
              </Button>
            ) : null}
            <NodeLabel label={view === 'members' ? ui.chat.membersPanelTitle : title} />
            {view !== 'members' ? (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto shrink-0 hover:bg-accent"
                onClick={onClose}
                aria-label={ui.common.close}
              >
                <X />
              </Button>
            ) : null}
          </div>
        ) : null}
        {view === 'members' && conversation ? (
          <ConversationMembersPanel
            conversation={conversation}
            onAddMembers={onAddMembers ?? (() => {})}
          />
        ) : (
          <>
            {/* Панель вложений: смонтирована ПОСТОЯННО после первого открытия
                (без ремаунтов при смене видов — плавность анимаций колонки);
                в режиме поиска скрыта CSS — поиск стоит ПОВЕРХ неё. */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4',
                view === 'search' && 'hidden',
              )}
            >
              {!isNotes ? (
                <div className="flex shrink-0 gap-1 rounded-lg bg-muted/40 p-1">
                  {(
                    [
                      ['files', ui.chat.favoritesTabFiles],
                      ['favorites', ui.chat.favoritesTab],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      aria-pressed={tab === value}
                      className={cn(
                        'flex-1 rounded-md px-2 py-1 text-body-xs transition-colors',
                        tab === value
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {tab === 'favorites' && !isNotes ? (
                <FavoritesTab query={favoritesQuery} conversationId={conversationId} />
              ) : (
                <>
                  {threadRootId ? (
                    <div className="flex shrink-0 gap-1 rounded-lg bg-muted/40 p-1">
                      {(['all', 'thread'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setScope(s)}
                          aria-pressed={scope === s}
                          className={cn(
                            'flex-1 rounded-md px-2 py-1 text-body-xs transition-colors',
                            scope === s
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {s === 'all' ? ui.chat.scopeAll : ui.chat.scopeThread}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {/* Закрепов в панели НЕТ (вердикт владельца 24.09, #91): обзор
                      закрепов — пин-бар ленты; панель — файлы и ссылки беседы. */}
                  <Section icon={FileText} title={ui.chat.filesMedia}>
                    {files.length > 0 ? (
                      files.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() =>
                            openViewer({
                              fileId: file.fileId,
                              name: file.name,
                              mime: file.mime,
                              size: file.size,
                              url: file.url,
                              previewKind: file.previewKind,
                              pdfUrl: file.pdfUrl,
                            })
                          }
                          className="truncate text-left text-sm text-info hover:underline"
                          title={file.name}
                        >
                          {file.name}
                        </button>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
                    )}
                  </Section>

                  <Section icon={Link2} title={ui.chat.links}>
                    {links.length > 0 ? (
                      links.map((link) => (
                        <a
                          key={link}
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-sm text-info hover:underline"
                        >
                          {link}
                        </a>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
                    )}
                  </Section>
                </>
              )}
            </div>
            {/* Поиск — ПОВЕРХ панели вложений (кнопка «назад», канон вида
                участников) или standalone (крестик). Смонтирован ВСЕГДА:
                первый выезд панели — чистая смена классов, тот же ритм
                анимации, что у вложений/участников (ремаунт в кадре анимации
                давал «инерцию с запаздыванием», 04.10 р.5). */}
            <ChatSearchPanel
              conversationId={conversationId}
              isFavorites={isNotes}
              active={view === 'search'}
              overFiles={open}
              onBack={onSearchBack ?? onClose}
              onClose={onClose}
              className={view !== 'search' ? 'hidden' : undefined}
            />
          </>
        )}
      </aside>
    </div>
  );
}

/** Кнопка тоггла панели беседы — для шапки беседы СПРАВА ВВЕРХУ (канон
 *  кнопки «О задаче» в полосе карточки задачи). При открытой панели уезжает
 *  влево: панель занимает её место в баре (вердикт владельца 15.09.2026). */
export function ChatPanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={ui.chat.panelTitle}
      title={ui.chat.panelTitle}
      className={cn(
        'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
        open ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <PanelRight className="size-4" strokeWidth={1.75} />
    </button>
  );
}

/** Вкладка «Избранное» беседы (#171, р.6): свои звезды этого чата — те же
 *  битрикс-строки, что в поисковой выдаче (FavoriteHitRow: полное имя, 3
 *  строки, вложения словами, звезда-заливка внизу справа), группировка
 *  заголовками дат; кликом — прыжок к оригиналу. Снятие звезды — в чате
 *  (ПКМ сообщения) или в витрине «Избранного». */
function FavoritesTab({
  query,
  conversationId,
}: {
  query: ReturnType<typeof useFavorites>;
  conversationId: string;
}) {
  const cards = (query.data?.pages ?? []).flatMap((page) => page.items);
  if (cards.length === 0 && !query.isLoading) {
    return (
      <div className="flex min-h-24 items-center justify-center">
        <Empty>
          <EmptyTitle>{ui.chat.favoritesEmpty}</EmptyTitle>
        </Empty>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {cards.map((card, index) => {
        const prev = cards[index - 1];
        const day = formatDayLabel(card.createdAt);
        const newDay = prev === undefined || formatDayLabel(prev.createdAt) !== day;
        return (
          <Fragment key={card.messageId}>
            {newDay ? (
              <span className="pb-1 pt-2 text-center text-xs text-muted-foreground">{day}</span>
            ) : null}
            <FavoriteHitRow
              author={card.author.displayName}
              snippet={card.text}
              attachments={card.attachments.map((a) => a.kind)}
              onJump={() =>
                useJumpStore.getState().request(conversationId, card.messageId, card.threadRootId)
              }
            />
          </Fragment>
        );
      })}
    </div>
  );
}
