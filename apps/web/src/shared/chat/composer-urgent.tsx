import { useState } from 'react';
import { Zap } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Checkbox } from '@nodus/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';

import { useUrgentPolicy } from './api.js';
import { useChatDrafts } from './chat-drafts.js';

/**
 * Молния «Важное» (#177): кнопка между полем ввода и смайликами; активное
 * состояние — заметная заливка warning-токенов (кандидат цвета — на приёмке
 * показываются янтарный/зелёный/красный образцы). По клику — маленький
 * попап над кнопкой: переключатель «Важное», чекбокс «Требовать
 * подтверждения» (включает повторы и чип «Ознакомлен») и счётчик дневного
 * лимита. Постоянной цифры на кнопке НЕТ (философия #100 — тихая
 * дисциплина: счётчик читается как непрочитанные и подстёгивает «потратить»).
 * Исчерпание лимита: молния приглушена, тултип объясняет; ошибка 409
 * отправки — инлайн в композере (composer-errors).
 *
 * Попап не крадёт «вечный курсор» (onOpenAutoFocus preventDefault, канон
 * #71); состояние живёт в черновике фокуса (сброс — очисткой черновика
 * после отправки; после F5 молния выключена).
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
  const [open, setOpen] = useState(false);
  const urgent = useChatDrafts((s) => s.drafts[draftKey]?.urgent ?? false);
  const requireAck = useChatDrafts((s) => s.drafts[draftKey]?.requireAck ?? false);
  const setUrgent = useChatDrafts((s) => s.setUrgent);
  const setRequireAck = useChatDrafts((s) => s.setRequireAck);
  // Счётчик опрашивается только при открытом попапе (30 c staleTime).
  const policy = useUrgentPolicy(open);
  const exhausted = (policy.data?.remaining ?? 1) <= 0;
  const disabledByLimit = exhausted && !urgent;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'shrink-0 text-muted-foreground',
            align,
            urgent && 'bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning',
          )}
          aria-label={ui.notifications.urgentToggle}
          aria-pressed={urgent}
          title={
            disabledByLimit
              ? `${ui.notifications.urgentLimitReached} (${policy.data?.limit} ${ui.notifications.ackStatusOf} ${policy.data?.limit})`
              : ui.notifications.urgentToggle
          }
          disabled={disabled || disabledByLimit}
        >
          <Zap
            strokeWidth={1.75}
            fill={urgent ? 'currentColor' : 'none'}
            className={cn(exhausted && 'opacity-60')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 p-3"
        // «Вечный курсор» (канон #71): попап не крадёт фокус композера.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">
                {ui.notifications.urgentToggle}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {ui.notifications.urgentToggleHint}
              </span>
            </div>
            <Switch
              size="sm"
              checked={urgent}
              onCheckedChange={(on) => setUrgent(draftKey, on)}
              aria-label={ui.notifications.urgentToggle}
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">
                {ui.notifications.urgentRequireAck}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {ui.notifications.urgentRequireAckHint}
              </span>
            </div>
            <Checkbox
              checked={requireAck}
              disabled={!urgent}
              onCheckedChange={(on) => setRequireAck(draftKey, on === true)}
              aria-label={ui.notifications.urgentRequireAck}
            />
          </label>
          {policy.data ? (
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
              <span>
                {ui.notifications.urgentToday} {policy.data.limit - policy.data.remaining}{' '}
                {ui.notifications.ackStatusOf} {policy.data.limit}
              </span>
              {policy.data.resetAt ? (
                <span className="font-mono tabular-nums">
                  {new Date(policy.data.resetAt).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Guardrail подтверждения (#177, рецепт Mattermost): «Требовать
 * подтверждения» в беседе от groupMax участников — мягкий диалог до
 * отправки. Мимо-клик = «нет» (канон подтверждений без ввода).
 */
export function UrgentGuardrailDialog({
  open,
  memberCount,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  memberCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{ui.notifications.urgentGuardrailTitle}</DialogTitle>
        <DialogDescription>
          {ui.notifications.urgentGuardrail.replace('{count}', String(memberCount))}
        </DialogDescription>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {ui.common.cancel}
          </Button>
          <Button type="button" variant="default" onClick={onConfirm}>
            {ui.notifications.urgentGuardrailSend}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
