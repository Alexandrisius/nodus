import { Building2 } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { formatDateTime } from '../../../shared/lib/format.js';
import { ChannelChip } from './channel-chip.js';
import { DocumentStatusBadge } from './document-status-badge.js';

/**
 * Почтовая шапка карточки (единый шаблон сущности, модель v2):
 * корреспондент-организация — квадратом с иконкой; «Кому» (внутренние
 * получатели; у исходящего — контрагент) и «Копия»; «От» (ящик) у исходящего;
 * дата; справа — чипы: статус документа, регистрация (рег.№ моно /
 * «Без регистрации»), канал поступления.
 */
export function LetterHeader({ letter }: { letter: LetterDetail }) {
  const recipients = letter.recipients.map((r) => r.displayName).join(', ');
  const copies = letter.cc.map((r) => r.displayName).join(', ');

  return (
    <div className="flex items-start gap-3">
      <span className="node-panel flex size-10 shrink-0 items-center justify-center">
        <Building2 className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {letter.counterparty.name}
        </div>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {letter.type === 'outgoing' ? (
            <span className="truncate">
              {ui.letters.from}:{' '}
              <span className="font-mono text-label-sm">{letter.mailbox.address}</span>
            </span>
          ) : null}
          <span className="truncate">
            {ui.letters.to}:{' '}
            {letter.type === 'outgoing' ? letter.counterparty.name : recipients || ui.common.notSet}
          </span>
          {copies ? (
            <span className="truncate">
              {ui.letters.cc}: {copies}
            </span>
          ) : null}
          <span className="tabular-nums">{formatDateTime(letter.date)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <DocumentStatusBadge letter={letter} />
        {letter.registration ? (
          <NodeChip tone="info" className="font-mono">
            {letter.registration.regNumber}
          </NodeChip>
        ) : (
          <NodeChip tone="warning">{ui.letters.noRegistration}</NodeChip>
        )}
        <ChannelChip channel={letter.receiveChannel} />
      </div>
    </div>
  );
}
