import { History, Paperclip, Star, X } from 'lucide-react';
import { memo, useState } from 'react';
import type { TaskDetail, VaultItemType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { cn } from '@nodus/ui/lib/utils';

import { useTaskConversation } from '../../../shared/chat/api.js';
import { ChatProfilePane } from '../../../shared/chat/chat-profile-pane.js';
import { VaultWindow } from '../../../shared/chat/vault-window.js';
import { formatDateTime } from '../../../shared/lib/format.js';

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Star;
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
 * Выдвижная дополнительная панель «О задаче» — ВТАЛКИВАЮЩАЯ колонка справа
 * (не оверлей: чат и композер остаются доступны, вердикт владельца; плавный
 * пуш — transition-[width] на колонке-обёртке в task-card). Роль правой
 * панели беседы мессенджера (закон «где чат — там панель вложений»): та же
 * витрина беседы задачи (#252) — «Звук» и категории-счётчики картинок/видео/
 * аудио/файлов/ссылок с окном категории (VaultWindow поверх панели), плюс
 * история и избранное задачи. По умолчанию скрыта.
 */
export const TaskAboutDrawer = memo(function TaskAboutDrawer({
  task,
  onClose,
}: {
  task: TaskDetail;
  onClose: () => void;
}) {
  // Вложения задачи = вложения её чата (#252): витрина беседы задачи,
  // строка беседы — тот же кэш by-task, что у обсуждения.
  const conversation = useTaskConversation(task.id).data;
  const conversationId = conversation?.id;
  const [vaultType, setVaultType] = useState<VaultItemType | null>(null);
  const [favorite, setFavorite] = useState(false);

  return (
    // Геометрия Битрикс24 (вердикт владельца 15.09.2026): панель —
    // ПОЛНОВЫСОТНАЯ колонка-сиблинг, занимает ВЕРХНИЙ БАР карточки тоже;
    // верхняя строка (название слева, избранное и крестик У КРАЯ справа) —
    // на высоте бара, border-b продолжает линию бара; внутренних перегородок
    // нет, единственная вертикаль — структурная левая граница колонки.
    <aside className="relative flex h-full w-[22.5rem] flex-col border-l border-border bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <NodeLabel label={ui.tasks.aboutTask} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            aria-label={ui.tasks.favorite}
            className={cn(
              'rounded-lg p-1.5 hover:bg-accent',
              favorite ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            <Star className={cn('size-4.5', favorite && 'fill-current')} />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-accent"
            onClick={onClose}
            aria-label={ui.common.close}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Section icon={Paperclip} title={ui.chat.filesMedia}>
          {conversationId ? (
            <ChatProfilePane
              conversationId={conversationId}
              conversation={conversation}
              onOpenVaultType={setVaultType}
              compact
            />
          ) : (
            <span className="text-sm text-muted-foreground">{ui.common.empty}</span>
          )}
        </Section>

        <Section icon={History} title={ui.tasks.history}>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{ui.tasks.created}</span>
            <span className="shrink-0 font-mono text-label-sm text-muted-foreground">
              {formatDateTime(task.createdAt)}
            </span>
          </span>
          <span className="flex justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{ui.tasks.updated}</span>
            <span className="shrink-0 font-mono text-label-sm text-muted-foreground">
              {formatDateTime(task.updatedAt)}
            </span>
          </span>
        </Section>
      </div>
      {/* Окно категории витрины — поверх всей панели (канон панели беседы). */}
      {conversationId ? (
        <VaultWindow
          conversationId={conversationId}
          type={vaultType}
          onClose={() => setVaultType(null)}
        />
      ) : null}
    </aside>
  );
});
