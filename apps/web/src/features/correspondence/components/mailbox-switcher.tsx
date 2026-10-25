import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

import {
  SEGMENTED_INNER_RADIUS,
  SEGMENTED_OUTER_RADIUS,
  SEGMENTED_PADDING,
} from '../../../shared/ui/segmented-control.js';

/** Переключатель ящиков «Общий / Личная» — ЗАДЕЛ направления (вердикт
 *  владельца 22.09.2026): в концепте один общий ящик компании, личная почта
 *  появится на втором этапе продукта (переключатель уже на месте, личный
 *  ящик неактивен с подсказкой). Радиусы — концентрические, как у
 *  `SegmentedControl`: внутренний = внешний − отступ − рамка. */
export function MailboxSwitcher() {
  return (
    <div
      role="group"
      aria-label={ui.letters.mailbox}
      className="flex shrink-0 items-center gap-0.5 border border-border"
      style={{ borderRadius: SEGMENTED_OUTER_RADIUS, padding: SEGMENTED_PADDING }}
    >
      <span
        className="bg-accent px-2 py-0.5 text-xs font-medium text-foreground"
        style={{ borderRadius: SEGMENTED_INNER_RADIUS }}
      >
        {ui.letters.mailboxShared}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-disabled
            className="cursor-not-allowed px-2 py-0.5 text-xs text-muted-foreground/60"
            style={{ borderRadius: SEGMENTED_INNER_RADIUS }}
          >
            {ui.letters.mailboxPersonal}
          </span>
        </TooltipTrigger>
        <TooltipContent>{ui.letters.mailboxPersonalHint}</TooltipContent>
      </Tooltip>
    </div>
  );
}
