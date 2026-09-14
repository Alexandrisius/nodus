import { useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { SendHexButton } from '../ui/send-hex-button.js';
import { isSendShortcut } from './send-keys.js';

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

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    onSend(trimmed);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  // Классика мессенджеров (вердикт владельца 14.09.2026): Enter — отправить,
  // Shift+Enter / Ctrl+Enter — перенос строки.
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSendShortcut(event.key, event.shiftKey, event.ctrlKey)) return;
    event.preventDefault();
    send();
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'flex h-16 shrink-0 items-center gap-2 border-t border-border bg-card px-3',
        className,
      )}
    >
      {/* autoFocus: вход в чат = курсор сразу в композере (вердикт владельца
          14.09.2026: «не тыкаться мышкой»); key по conversationId в пейнах
          ремоунтит композер — фокус возвращается при каждой смене беседы. */}
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        className="max-h-14 min-h-9 flex-1 resize-none"
      />
      <SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
    </form>
  );
}
