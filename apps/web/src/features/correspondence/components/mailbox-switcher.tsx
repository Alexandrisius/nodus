import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';

/** Переключатель ящиков «Общий / Личная» — ЗАДЕЛ направления (вердикт
 *  владельца 22.09.2026): в концепте один общий ящик компании, личная почта
 *  появится на втором этапе продукта (переключатель уже на месте, личный
 *  ящик неактивен с подсказкой). */
export function MailboxSwitcher() {
  return (
    <div
      role="group"
      aria-label={ui.letters.mailbox}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground">
        {ui.letters.mailboxShared}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-disabled
            className="cursor-not-allowed rounded-md px-2 py-0.5 text-xs text-muted-foreground/60"
          >
            {ui.letters.mailboxPersonal}
          </span>
        </TooltipTrigger>
        <TooltipContent>{ui.letters.mailboxPersonalHint}</TooltipContent>
      </Tooltip>
    </div>
  );
}
