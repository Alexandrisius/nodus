import { Landmark, Mail, ScrollText } from 'lucide-react';
import type { ReceiveChannel } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

const channelIcon: Record<ReceiveChannel, typeof Mail> = {
  email: Mail,
  smdo: Landmark,
  paper: ScrollText,
};

/** Канал поступления/отправки письма (почта / СМДО / бумага): колонка списка,
 *  фильтр и чип карточки. Коннектора СМДО нет — канал в модели с первого дня
 *  (вердикт владельца 22.09.2026). */
export function ChannelChip({ channel }: { channel: ReceiveChannel }) {
  const Icon = channelIcon[channel];
  return (
    <NodeChip tone="muted">
      <Icon className="size-3" strokeWidth={1.75} />
      {ui.letters.channels[channel]}
    </NodeChip>
  );
}
