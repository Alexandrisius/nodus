import { useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { ErrorCode, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Checkbox } from '@nodus/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@nodus/ui/components/popover';
import { Switch } from '@nodus/ui/components/switch';
import { cn } from '@nodus/ui/lib/utils';

import { useUrgentPolicy } from './api.js';
import { useChatDrafts } from './chat-drafts.js';
import { useComposerErrors } from './composer-errors.js';

/**
 * Молния «Важное» (#177, ревизия приёмки 05.10 — канон Яндекс-мессенджера):
 * КЛИК = мгновенное включение/выключение «Важного», БЕЗ меню — массовый путь
 * не заставляет никого смотреть на настройки. Попап (счётчик лимита + чекбокс
 * «Требовать подтверждения») всплывает по НАВЕДЕНИЮ (задержка 350 мс, чтобы
 * мимо-провод не открывал) и по ПКМ — явный путь для редкого сценария.
 *
 * Счётчик в попапе (не на кнопке — философия #100 «тихая дисциплина»).
 * Исчерпание лимита: молния приглушена и НЕ кликается; источник истины —
 * GET политики при МОНТАЖЕ композера (переживает перезагрузку страницы,
 * находка приёмки: раньше после F5 кнопка снова нажималась до первого 409)
 * плюс код 409 последней отправки из composer-errors.
 * Попап не крадёт «вечный курсор» (onOpenAutoFocus preventDefault, канон #71).
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
  // Политика — при монтировании (стартовое приглушение после F5) и с refresh
  // при открытии попапа (30 с staleTime, кэш общий на все композеры сессии).
  const policy = useUrgentPolicy(true);
  const sendErrorCode = useComposerErrors((s) => s.codes[draftKey]);
  const exhausted =
    (policy.data?.remaining ?? 1) <= 0 || sendErrorCode === ErrorCode.CHAT_URGENT_LIMIT_EXCEEDED;
  const blocked = exhausted && !urgent;

  // Hover-intent: открытие через 350 мс наведения, закрытие — с «прощальным»
  // окном 180 мс (успеть провести курсор с молнии на чекбокс попапа).
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const cancelHover = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  const onEnter = () => {
    window.clearTimeout(closeTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), 350);
  };
  const onLeave = () => {
    window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Якорь БЕЗ триггера: клик по молнии — ТОЛЬКО тоггл (канон Яндекса),
          открытие попапа управляется наведением/ПКМ, а не кликом. */}
      <PopoverAnchor asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'shrink-0 text-muted-foreground',
            align,
            urgent && 'bg-warning-soft text-warning hover:bg-warning-soft hover:text-warning',
            blocked && 'opacity-60',
          )}
          aria-label={ui.notifications.urgentToggle}
          aria-pressed={urgent}
          aria-disabled={blocked || disabled || undefined}
          title={
            blocked
              ? `${ui.notifications.urgentLimitReached} (${policy.data?.limit} ${ui.notifications.ackStatusOf} ${policy.data?.limit})`
              : ui.notifications.urgentToggle
          }
          disabled={disabled}
          onClick={() => {
            // Лимит исчерпан — молния не кликается (кроме выключения горящей).
            if (blocked || disabled) return;
            setUrgent(draftKey, !urgent);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            cancelHover();
            setOpen(true);
          }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <Zap strokeWidth={1.75} fill={urgent ? 'currentColor' : 'none'} />
        </Button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 p-3"
        // «Вечный курсор» (канон #71): попап не крадёт фокус композера.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={() => window.clearTimeout(closeTimer.current)}
        onMouseLeave={onLeave}
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
              /* Чекбокс доступен ВСЕГДА: включение само поднимает молнию
                 (setRequireAck → urgent: true), модель Mattermost. */
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
