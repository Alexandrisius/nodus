import { CheckCheck, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Notification } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Button } from '@nodus/ui/components/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@nodus/ui/components/context-menu';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@nodus/ui/components/empty';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';
import {
  groupNotifications,
  sortAttentionGroups,
  type NotificationGroup,
} from '../model/group-notifications.js';
import { useOpenNotification } from '../model/open-notification.js';
import { ensureActiveTab, resolveTabs, type FeedTab } from '../model/feed-tabs.js';
import { useNotificationTabsStore } from '../model/tabs-prefs-store.js';
import type { SourceRect } from '../../../app/shell/slider-panel.js';
import { NotificationRow } from './notification-row.js';
import { TabsSettingsDialog } from './tabs-settings-dialog.js';

/**
 * Лента уведомлений — центральная колонка «Главной» (#189): вкладки-фильтры
 * (системные + кастомные, Slack-паттерн; «+» — окно настройки, ПКМ —
 * переименовать/удалить/скрыть, «Все» защищена) → группы по источнику
 * (срочно → высокий → средний) → свёрнутый журнал низкого приоритета. Клик
 * по строке — сразу к источнику (Битрикс24); срочное и безисточниковое —
 * ридер-панель. Строки поиска нет (фидбек тестировщиков 02.10: не влезает;
 * поиск уведомлений — будущий глобальный поиск топбара, #172).
 */
export function NotificationsFeed({
  attentionItems,
  backgroundItems,
  backgroundTotal,
  loading,
}: {
  attentionItems: Notification[];
  backgroundItems: Notification[];
  backgroundTotal: number;
  loading: boolean;
}) {
  const custom = useNotificationTabsStore((s) => s.custom);
  const hiddenSystem = useNotificationTabsStore((s) => s.hiddenSystem);
  const removeTab = useNotificationTabsStore((s) => s.removeTab);
  const hideSystemTab = useNotificationTabsStore((s) => s.hideSystemTab);
  const [tab, setTab] = useState<string>('all');
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const openNotification = useOpenNotification();

  const tabs = useMemo(() => resolveTabs(custom, hiddenSystem), [custom, hiddenSystem]);
  const activeId = ensureActiveTab(tab, tabs);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!;
  const allUnread = useMemo(
    () => [...attentionItems, ...backgroundItems],
    [attentionItems, backgroundItems],
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tabs) map.set(t.id, allUnread.filter((n) => t.match(n)).length);
    return map;
  }, [tabs, allUnread]);

  const tabFiltered = useMemo(() => {
    const source = activeId === 'all' ? allUnread : allUnread.filter((n) => active.match(n));
    const attention = source.filter((n) => n.priority !== 'low');
    const background = source.filter((n) => n.priority === 'low');
    return { attention, background };
  }, [allUnread, active, activeId]);

  const attentionGroups = useMemo(
    () => sortAttentionGroups(groupNotifications(tabFiltered.attention)),
    [tabFiltered],
  );
  const backgroundGroups = useMemo(() => groupNotifications(tabFiltered.background), [tabFiltered]);

  const showOnboarding = !loading && attentionItems.length === 0 && backgroundItems.length === 0;

  function openSettings(editing: string | null): void {
    setEditingId(editing);
    setSettingsOpen(true);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={ui.notifications.feedTitle}
          className="flex items-center gap-1.5"
        >
          {tabs.map((t) => (
            <FeedTabButton
              key={t.id}
              tab={t}
              active={t.id === activeId}
              count={counts.get(t.id) ?? 0}
              onSelect={() => setTab(t.id)}
              onRename={t.system === null ? () => openSettings(t.id) : undefined}
              onDelete={t.system === null ? () => removeTab(t.id) : undefined}
              onHide={
                t.system !== null && t.system !== 'all' ? () => hideSystemTab(t.system!) : undefined
              }
            />
          ))}
          {/* «+» сразу за последней вкладкой (фидбек владельца 03.10:
              прижат к вкладкам, не к правому краю широкоформатного экрана). */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={ui.notifications.tabAdd}
            title={ui.notifications.tabAdd}
            onClick={() => openSettings(null)}
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : showOnboarding ? (
        <OnboardingBlock />
      ) : attentionGroups.length === 0 && backgroundGroups.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <CheckCheck className="size-5" strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {activeId === 'all' ? ui.notifications.allClean : ui.notifications.tabNoResults}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <section className="flex flex-col gap-3" aria-label={ui.notifications.attentionSection}>
          {attentionGroups.map((group) => (
            <NotificationGroupRow key={group.key} group={group} onOpen={openNotification} />
          ))}
        </section>
      )}

      {backgroundGroups.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={ui.notifications.lowSection}>
          {backgroundOpen ? (
            <>
              <button
                type="button"
                onClick={() => setBackgroundOpen(false)}
                className="flex items-center gap-2 text-left"
              >
                <NodeLabel label={ui.notifications.lowSection} chevron="down" />
              </button>
              {backgroundGroups.map((group) => (
                <NotificationGroupRow key={group.key} group={group} onOpen={openNotification} />
              ))}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setBackgroundOpen(true)}
              className="flex items-center gap-2 text-left text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown className="size-3.5 -rotate-90" strokeWidth={1.75} />
              <span className="text-sm">
                {ui.notifications.showAllLow} ({backgroundTotal})
              </span>
            </button>
          )}
        </section>
      )}

      {settingsOpen && (
        <TabsSettingsDialog
          key={editingId ?? 'new'}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          editing={custom.find((t) => t.id === editingId) ?? null}
        />
      )}
    </div>
  );
}

/** Вкладка ленты: «Все» — без ПКМ (защищена); системная — только «Скрыть»;
 *  кастомная — «Переименовать»/«Удалить» (#189). */
function FeedTabButton({
  tab,
  active,
  count,
  onSelect,
  onRename,
  onDelete,
  onHide,
}: {
  tab: FeedTab;
  active: boolean;
  count: number;
  onSelect: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onHide?: () => void;
}) {
  const button = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'h-7 rounded-4xl px-3 text-xs font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
      )}
    >
      {tab.label}
      <span className="ml-1.5 font-mono tabular-nums opacity-70">{count}</span>
    </button>
  );
  if (onRename === undefined && onHide === undefined) return button;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      <ContextMenuContent>
        {onRename !== undefined && (
          <ContextMenuItem onSelect={onRename}>
            <Pencil />
            {ui.notifications.tabsRename}
          </ContextMenuItem>
        )}
        {onDelete !== undefined && (
          <ContextMenuItem onSelect={onDelete} variant="destructive">
            <Trash2 />
            {ui.notifications.tabsDelete}
          </ContextMenuItem>
        )}
        {onHide !== undefined && (
          <ContextMenuItem onSelect={onHide}>{ui.notifications.tabsHide}</ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NotificationGroupRow({
  group,
  onOpen,
}: {
  group: NotificationGroup;
  onOpen: (item: Notification, sourceRect?: SourceRect) => void;
}) {
  return <NotificationRow group={group} onOpen={onOpen} />;
}

/** Первый вход (нет уведомлений) — onboarding-подсказки (Linear-паттерн, E10). */
function OnboardingBlock() {
  return (
    <div className="node-panel flex flex-col gap-3 p-6">
      <div className="text-base font-semibold">{ui.notifications.onboardingTitle}</div>
      <p className="text-sm text-muted-foreground">{ui.notifications.onboardingBody}</p>
    </div>
  );
}
