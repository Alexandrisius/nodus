import { ui } from '@nodus/contracts';

/** Строка статуса композера (chat-composer.tsx): превалидация лимита текста
 *  (раунд 3) и инлайн-ошибка 409 политики важных (#177). */
export function ComposerStatusLine({
  limit,
  sendError,
}: {
  limit: { over: boolean; counter: string | null };
  sendError: { message: string } | null;
}) {
  return limit.over ? (
    <span className="px-1.5 text-label-sm text-destructive" role="status" aria-live="polite">
      {ui.chat.messageLimitHint}
    </span>
  ) : sendError ? (
    <span className="px-1.5 text-label-sm text-destructive" role="status" aria-live="polite">
      {sendError.message}
    </span>
  ) : limit.counter !== null ? (
    <span className="px-1.5 text-right font-mono text-label-sm text-muted-foreground tabular-nums">
      {limit.counter}
    </span>
  ) : null;
}
