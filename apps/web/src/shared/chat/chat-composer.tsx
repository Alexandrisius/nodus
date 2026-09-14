import { Mic, Paperclip, Smile } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';

import { SendHexButton } from '../ui/send-hex-button.js';
import { registerComposer, unregisterComposer } from './composer-focus.js';
import { isSendShortcut } from './send-keys.js';

/** Композер сообщений (единый для чатов, каналов и тредов): бар h-16 —
 *  канон нижних баров карточки (верхние линии всех баров — одна горизонталь),
 *  фирменная отправка SendHexButton. Панель инструментов мессенджера
 *  (вердикт владельца 14.09.2026: «значки сразу, чтобы не забыть потом»):
 *  скрепка вложений слева, смайл и микрофон справа — ЗАГЛУШКИ до issues
 *  загрузки/эмодзи/голосовых (схема вложений уже готова их принять).
 *  Контур поля при активном курсоре НЕ подсвечивается (вердикт владельца:
 *  «некрасиво») — фокус виден самим курсором. */
export function ChatComposer({
  placeholder,
  onSend,
  focusId,
  className,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  /** Владелец «вечного курсора» (composer-focus): уникальный id композера
   *  (беседа/лента канала/тред) — курсор возвращается в активный композер
   *  после обычных кликов по UI, как в Телеграм. */
  focusId: string;
  className?: string;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // «Вечный курсор»: монтаж — композер активный владелец; размонтаж (закрыли
  // тред) — курсор возвращается ранее зарегистрированному (ленте канала).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    registerComposer(focusId, el);
    return () => unregisterComposer(focusId, el);
  }, [focusId]);

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
        'flex h-16 shrink-0 items-center gap-1 border-t border-border bg-card px-3',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        aria-label={ui.chat.attachFile}
        title={ui.chat.attachFile}
      >
        <Paperclip />
      </Button>
      {/* autoFocus: вход в чат = курсор сразу в композере (вердикт владельца
          14.09.2026: «не тыкаться мышкой»); key по conversationId в пейнах
          ремоунтит композер — фокус возвращается при каждой смене беседы.
          focus-visible без кольца и смены бордюра: контур поля статичен. */}
      <Textarea
        ref={inputRef}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
        className="max-h-14 min-h-9 flex-1 resize-none focus-visible:border-input focus-visible:ring-0"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        aria-label={ui.chat.emoji}
        title={ui.chat.emoji}
      >
        <Smile />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        aria-label={ui.chat.voice}
        title={ui.chat.voice}
      >
        <Mic />
      </Button>
      <SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
    </form>
  );
}
