import { CheckCheck, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Notification } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@nodus/ui/components/empty';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Skeleton } from '@nodus/ui/components/skeleton';
import { cn } from '@nodus/ui/lib/utils';
import {
  groupNotifications,
  sortAttentionGroups,
  type NotificationGroup,
} from '../model/group-notifications.js';
import { useOpenNotification } from '../model/open-notification.js';
import type { SourceRect } from '../../../app/shell/slider-panel.js';
import { NotificationRow } from './notification-row.js';

/** Табы ленты (Slack-паттерн: All/Unread/Mentions — один всегда активен,
 *  фидбек владельца 01.10): считаются по непрочитанным — лента и есть
 *  входящий ящик, прочитанное уходит из неё (журнал-история — на сервере). */
type FeedTab = 'all' | 'urgent' | 'mentions' | 'actions';

const TABS: Array<{ id: FeedTab; label: string }> = [
  { id: 'all', label: ui.notifications.pillAll },
  { id: 'urgent', label: ui.notifications.pillUrgent },
  { id: 'mentions', label: ui.notifications.pillMentions },
  { id: 'actions', label: ui.notifications.pillActions },
];

function matchesTab(tab: FeedTab): (n: Notification) => boolean {
  if (tab === 'urgent') return (n) => n.tier === 'urgent';
  if (tab === 'mentions') return (n) => n.kind === 'chat.mention';
  if (tab === 'actions') return (n) => n.tier === 'action';
  return () => true;
}

/** Лента уведомлений — центральная колонка «Главной» (личный старт):
 *  табы-счётчики + поиск → группы по источнику (срочно → личное → действия)
 *  → свёрнутый «ФОН». Клик по строке — сразу к источнику (Битрикс24);
 *  срочное и безисточниковое — ридер-панель. */
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
  const [tab, setTab] = useState<FeedTab>('all');
  const [query, setQuery] = useState('');
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const openNotification = useOpenNotification();

  const counts = useMemo(
    () => ({
      all: attentionItems.length,
      urgent: attentionItems.filter((n) => n.tier === 'urgent').length,
      mentions: attentionItems.filter((n) => n.kind === 'chat.mention').length,
      actions: attentionItems.filter((n) => n.tier === 'action').length,
    }),
    [attentionItems],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items: Notification[]) =>
      q.length === 0
        ? items
        : items.filter(
            (n) =>
              (n.preview ?? '').toLowerCase().includes(q) ||
              (n.actor?.displayName ?? '').toLowerCase().includes(q),
          );
  }, [query]);

  const tabFiltered = useMemo(() => {
    const source = tab === 'all' ? attentionItems : attentionItems.filter(matchesTab(tab));
    return filtered(source);
  }, [attentionItems, tab, filtered]);

  const attentionGroups = useMemo(
    () => sortAttentionGroups(groupNotifications(tabFiltered)),
    [tabFiltered],
  );
  const backgroundGroups = useMemo(
    () => groupNotifications(filtered(backgroundItems)),
    [backgroundItems, filtered],
  );

  const showOnboarding = !loading && attentionItems.length === 0 && backgroundItems.length === 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={ui.notifications.feedTitle}
          className="flex items-center gap-1.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'h-7 rounded-4xl px-3 text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {t.label}
              <span className="ml-1.5 font-mono tabular-nums opacity-70">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        {/* Поиск — динамическая ширина (фидбек владельца 01.10: на широкоформатном
            мониторе узкая фиксированная «не смотрится»): остаток строки с потолком. */}
        <div className="relative ml-auto w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ui.notifications.searchPlaceholder}
            className="h-9 pl-9"
            aria-label={ui.notifications.searchPlaceholder}
          />
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
      ) : attentionGroups.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <CheckCheck className="size-5" strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {tab === 'all' && query.trim().length === 0
                ? ui.notifications.allClean
                : ui.notifications.searchEmpty}
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

      {attentionGroups.length > 0 && backgroundGroups.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={ui.notifications.backgroundSection}>
          {backgroundOpen ? (
            <>
              <button
                type="button"
                onClick={() => setBackgroundOpen(false)}
                className="flex items-center gap-2 text-left"
              >
                <NodeLabel label={ui.notifications.backgroundSection} chevron="down" />
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
                {ui.notifications.showAllBackground} ({backgroundTotal})
              </span>
            </button>
          )}
        </section>
      )}
    </div>
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
