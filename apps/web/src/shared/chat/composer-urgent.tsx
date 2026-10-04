import { Zap } from 'lucide-react';
import { ErrorCode, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { useUrgentPolicy } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import { useComposerErrors } from './composer-errors.js';

/**
 * Молния «Важное» (#177, ревизия модели 05.10 — канон Яндекс-мессенджера):
 * КЛИК = мгновенное включение/выключение «Важного». Никакого меню,
 * счётчика и подтверждения (решение владельца 05.10): состояние видно по
 * ЦВЕТУ глифа — горит жёлтым/залитая, погашена серой; ховер-заливки нет.
 * Сколько осталось — тултип при наведении. Источник — GET политики при
 * монтаже композера (приглушение переживает перезагрузку) плюс код 409
 * последней отправки из composer-errors. Исчерпание: молния приглушена,
 * клик не включает (выключить горящую можно).
 */
export function ComposerUrgentButton({
  draftKey,
  align,
  disabled = false,
}: {
  draftKey: string;
  align: 'self-end' | 'self-center';
  /** Пересылка/селект/правка: кнопка на месте, но выключена. */
  disabled?: boolean;
}) {
  const urgent = useChatDrafts((s) => s.drafts[draftKey]?.urgent ?? false);
  const setUrgent = useChatDrafts((s) => s.setUrgent);
  // Политика — при монтировании (30 с staleTime, кэш на сессию общий).
  const policy = useUrgentPolicy(true);
  const sendErrorCode = useComposerErrors((s) => s.codes[draftKey]);
  const exhausted =
    (policy.data?.remaining ?? 1) <= 0 || sendErrorCode === ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED;
  const blocked = exhausted && !urgent;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        // Без ховер-заливки квадратом (ревизия владельца 05.10): состояние —
        // ТОЛЬКО цвет глифа; ghost-ховер кнопки подавлен.
        'relative shrink-0 bg-transparent shadow-none hover:bg-transparent hover:text-inherit',
        align,
        urgent ? 'text-warning' : 'text-muted-foreground',
        blocked && 'opacity-60',
      )}
      aria-label={ui.notifications.urgentToggle}
      aria-pressed={urgent}
      aria-disabled={blocked || disabled || undefined}
      title={
        blocked
          ? `${ui.notifications.urgentLimitReached} (${policy.data?.limit} ${ui.notifications.ackStatusOf} ${policy.data?.limit})`
          : `${ui.notifications.urgentToday} ${policy.data?.remaining ?? '—'} ${ui.notifications.ackStatusOf} ${policy.data?.limit ?? '—'}`
      }
      disabled={disabled}
      onClick={() => {
        // Лимит исчерпан — молния не включается (выключить горящую можно).
        if (blocked || disabled) return;
        setUrgent(draftKey, !urgent);
      }}
    >
      <Zap strokeWidth={1.75} fill={urgent ? 'currentColor' : 'none'} />
    </Button>
  );
}
