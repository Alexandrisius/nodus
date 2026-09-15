import { Link2, SquareArrowOutUpRight } from 'lucide-react';
import { ui } from '@nodus/contracts';

import { copyCardLink } from '../lib/card-link.js';
import type { RowMenuItem } from './row-menu.js';

/** Стандартная пара пунктов меню строки журнала — «Открыть» карточку и
 *  «Копировать ссылку» deep-link ?cards=kind:id (аудит #45 — 4 дословные
 *  копии в страницах). Доменные пункты фичи добавляют следом spread'ом. */
export function makeCardRowMenuItems<K extends string>(
  ref: { kind: K; id: string },
  openCard: (ref: { kind: K; id: string }) => void,
): RowMenuItem[] {
  return [
    {
      id: 'open',
      icon: <SquareArrowOutUpRight className="size-3.5" />,
      label: ui.common.open,
      onSelect: () => openCard(ref),
    },
    {
      id: 'copy',
      icon: <Link2 className="size-3.5" />,
      label: ui.common.copyLink,
      onSelect: () => void copyCardLink(ref),
    },
  ];
}
