import { PanelRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { SendHexButton } from '../ui/send-hex-button.js';

/** Композер сообщений (единый для чатов, тредов и обсуждений): бар h-16 —
 *  канон нижних баров карточки (верхние линии всех баров — одна горизонталь),
 *  фирменная отправка SendHexButton. Опциональная кнопка панели беседы
 *  (закон: где чат — там выдвижная панель вложений/ссылок). */
export function ChatComposer({
  placeholder,
  onSend,
  onTogglePanel,
  panelOpen = false,
  className,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  /** Тоггл правой панели беседы (файлы/ссылки); без пропа кнопки нет. */
  onTogglePanel?: () => void;
  panelOpen?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    onSend(trimmed);
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'flex h-16 shrink-0 items-center gap-2 border-t border-border bg-card px-3',
        className,
      )}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="max-h-14 min-h-9 flex-1 resize-none"
      />
      {onTogglePanel ? (
        <button
          type="button"
          onClick={onTogglePanel}
          aria-label={ui.chat.panelTitle}
          title={ui.chat.panelTitle}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent',
            panelOpen ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <PanelRight className="size-4.5" strokeWidth={1.75} />
        </button>
      ) : null}
      <SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
    </form>
  );
}
