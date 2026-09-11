import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { SendHexButton } from '../ui/send-hex-button.js';

/** Композер сообщений (единый для чатов, тредов и обсуждений): бар h-16 —
 *  канон нижних баров карточки (верхние линии всех баров — одна горизонталь),
 *  фирменная отправка SendHexButton. */
export function ChatComposer({
  placeholder,
  onSend,
  className,
}: {
  placeholder: string;
  onSend: (text: string) => void;
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
      <SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
    </form>
  );
}
