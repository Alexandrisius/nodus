import { FileText, Link2, PanelRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { threadScopeMessages } from './channel-layout.js';
import { useConversationMessages } from './api.js';
import { useFrameReady } from '../ui/use-frame-ready.js';
import { uiPx } from '../ui/ui-scale.js';

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
  open,
  onClose,
  title,
  headerClass = 'h-14',
  threadRootId = null,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  title: string;
  /** Высота верхней строки панели = высота верхнего бара хоста (линии
   *  border-b продолжаются друг в друга). */
  headerClass?: string;
  threadRootId?: string | null;
}) {
  const { data } = useConversationMessages(conversationId);
  const [scope, setScope] = useState<'all' | 'thread'>('all');
  // Плавное ПЕРВОЕ открытие: монтируемся в покое (w-0), класс раскрытия —
  // после двух кадров (useFrameReady), transition идёт с первого кадра.
  const ready = useFrameReady();
  // Контент — ЛЕНИВО на первом открытии и далее постоянно (скролл/состояние
  // не теряются): обёртка уже стоит в DOM с w-0, тяжёлый маунт секций не
  // попадает в кадры width-анимации первого тоггла (рывок ровно один раз,
  // баг-вердикт владельца 15.09.2026 — приём обёртки панели «О задаче»).
  const [contentMounted, setContentMounted] = useState(false);
  useEffect(() => {
    if (open) setContentMounted(true);
  }, [open]);
  useEffect(() => {
    if (!threadRootId) setScope('all');
  }, [threadRootId]);
  const items = data?.items ?? [];
  const scoped =
    threadRootId && scope === 'thread' ? threadScopeMessages(items, threadRootId) : items;
  const files = scoped.flatMap((m) => m.attachments);
  const links = scoped.flatMap((m) => m.text.match(/https?:\/\/\S+/g) ?? []);

  return (
    <div
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
        open && ready ? 'w-[18.75rem]' : 'w-0',
      )}
    >
      <aside className="flex h-full w-[18.75rem] flex-col border-l border-border bg-card">
        {/* Верхняя строка панели — НА УРОВНЕ бара хоста: название слева,
            крестик у самого правого края (реф Битрикс24, вердикт владельца
            15.09.2026); border-b продолжает линию бара хоста. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-2 border-b border-border px-3',
            headerClass,
          )}
        >
          <NodeLabel label={title} />
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 hover:bg-accent"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {contentMounted ? (
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

              <Section icon={FileText} title={ui.chat.filesMedia}>
                {files.length > 0 ? (
                  files.map((file) => (
                    <span key={file.id} className="truncate text-sm text-info">
                      {file.name}
                    </span>
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
          ) : null}
        </div>
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
