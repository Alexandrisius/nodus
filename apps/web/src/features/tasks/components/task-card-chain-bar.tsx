import { Mail, MessageSquare, PanelRight, Waypoints } from 'lucide-react';
import type { TaskChainNode, TaskDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { TaskCardMenu } from './task-card-menu.js';

const chainCaption: Record<TaskChainNode['kind'], string> = {
  letter: ui.letters.letter,
  resolution: ui.letters.resolution,
  instruction: ui.tasks.instruction,
  task: ui.tasks.task,
  chat_message: ui.tasks.chatNode,
};

/**
 * Полоса цепочки карточки задачи (h-14, над зонами): тоггл навигатора
 * ветки, доменная цепочка происхождения (Письмо → Резолюция → Поручение →
 * Задача; само-узел — только «ТИП · №», без повтора названия — оно один раз
 * в главном заголовке), чип источника, меню карточки и тоггл «О задаче».
 * Бордюр — структура (виден с первого кадра роста), контент — content-fade.
 */
export function TaskCardChainBar({
  task,
  branchOpen,
  aboutOpen,
  onToggleBranch,
  onToggleAbout,
}: {
  task: TaskDetail;
  branchOpen: boolean;
  aboutOpen: boolean;
  onToggleBranch: () => void;
  onToggleAbout: () => void;
}) {
  const openCard = useOpenCard();
  const chainNodes: ChainNode[] = task.chain.map((node, i) => ({
    caption: chainCaption[node.kind],
    ref: node.ref,
    // Само-узел (последний) — без повтора названия: оно один раз в заголовке.
    label: i === task.chain.length - 1 ? undefined : node.label,
    state: node.state,
    active: i === task.chain.length - 1,
    onClick:
      node.kind === 'letter' && node.entityId
        ? () => openCard({ kind: 'letter', id: node.entityId ?? '' })
        : undefined,
  }));

  return (
    <div className="shrink-0 border-b border-border">
      <div className="content-fade flex h-14 items-center gap-3 px-5">
        <button
          type="button"
          onClick={onToggleBranch}
          aria-label={ui.tasks.branch}
          title={ui.tasks.branch}
          className={cn(
            'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
            branchOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <Waypoints className="size-4" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <DomainChain nodes={chainNodes} />
        </div>
        {task.source === 'letter' ? (
          <NodeChip tone="info" className="shrink-0">
            <Mail className="size-3" />
            {ui.tasks.instruction}
          </NodeChip>
        ) : task.source === 'chat_message' ? (
          <NodeChip tone="info" className="shrink-0">
            <MessageSquare className="size-3" />
            {ui.tasks.fromChat}
          </NodeChip>
        ) : null}
        <TaskCardMenu task={task} />
        <button
          type="button"
          onClick={onToggleAbout}
          aria-label={ui.tasks.aboutTask}
          title={ui.tasks.aboutTask}
          className={cn(
            'shrink-0 rounded-lg p-2 transition-colors hover:bg-accent',
            aboutOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <PanelRight className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
