import { Zap } from 'lucide-react';
import { ErrorCode, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

import { useUrgentPolicy } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import { useComposerErrors } from './composer-errors.js';

/**
 * Молния «Важное» (#177, ревизия модели 05.10 — канон Яндекс-мессенджера):
 * КЛИК = мгновенное включение/выключение «Важного». Никакого меню и
 * подтверждения — ack-механика выпилена решением владельца; непрочитавшим
 * бэкенд сам повторяет пуш каждые 5 минут до часа (стоп — прочтение).
 *
 * Бейдж ЗАРЯДОВ (правый нижний угол кнопки, канон бейджа аватара): сколько
 * важных осталось сегодня (лимит 3/сутки); тултип при наведении объясняет:
 * «Осталось важных сегодня: 2 из 3». Источник — GET политики при монтаже
 * композера (приглушение переживает перезагрузку) плюс код 409 последней
 * отправки из composer-errors. Исчерпание: молния приглушена, клик не
 * переключает (кроме выключения горящей) — тост-заменитель не нужен.
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
  const remaining = policy.data?.remaining;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'relative shrink-0 text-muted-foreground',
        align,
        urgent && 'bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning',
        blocked && 'opacity-60',
      )}
      aria-label={ui.notifications.urgentToggle}
      aria-pressed={urgent}
      aria-disabled={blocked || disabled || undefined}
      title={
        policy.data
          ? blocked
            ? `${ui.notifications.urgentLimitReached} (${policy.data.limit} ${ui.notifications.ackStatusOf} ${policy.data.limit})`
            : `${ui.notifications.urgentChargesLeft}: ${remaining} ${ui.notifications.ackStatusOf} ${policy.data.limit}`
          : ui.notifications.urgentToggle
      }
      disabled={disabled}
      onClick={() => {
        // Лимит исчерпан — молния не включается (выключить горящую можно).
        if (blocked || disabled) return;
        setUrgent(draftKey, !urgent);
      }}
    >
      {/* Оптическая центровка молнии: глиф Zap визуально сидит выше
          геометрического центра (широкая верхушка) — полпикселя вниз. */}
      <Zap
        strokeWidth={1.75}
        fill={urgent ? 'currentColor' : 'none'}
        className="translate-y-[0.5px]"
      />
      {remaining !== undefined ? (
        <span
          data-slot="urgent-charges"
          aria-hidden
          className={cn(
            // Компактный бейдж (ревизия владельца 05.10): фиксированный
            // h-3/w-3 (12 дизайн-px, канон бейджа аватара), цифра — вниз
            // на 1px (глиф цифры оптически сидит выше центра строки).
            'absolute right-0 bottom-0 z-10 flex h-3 w-3 items-center justify-center rounded-full bg-warning pt-[1px] font-mono text-[8.5px] font-semibold text-background tabular-nums ring-1 ring-card select-none',
          )}
        >
          {remaining}
        </span>
      ) : null}
    </Button>
  );
}
