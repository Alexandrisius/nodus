import { Mic, Paperclip, Smile } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
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

  // Хореография Битрикс24 (скрепка вверху, смайл/микрофон внизу) — ТОЛЬКО
  // когда поле РАСТЁТ (больше одной строки). В покое (одна строка) обе
  // группы иконок — ПО ЦЕНТРУ высоты строки (баг-вердикт владельца
  // 15.09.2026: скрепка из-за self-start сидела выше центра).
  const [grown, setGrown] = useState(false);
  const baseHeight = useRef(0);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (baseHeight.current === 0) baseHeight.current = el.clientHeight;
      setGrown(el.clientHeight > baseHeight.current + 4);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        // Высота НЕ фиксирована: композер растёт с текстом (вердикт владельца
        // 15.09.2026, модель Битрикс24): min-h-16 держит канон нижних баров в
        // покое, py-2 + рост поля расширяют бар вверх, лента ужимается.
        'flex min-h-16 shrink-0 items-end gap-2 border-t border-border bg-card px-3 py-2',
        className,
      )}
    >
      {/* Единая поверхность композера (вердикт владельца 15.09.2026 + research:
          Битрикс24 «tools in the reply field», Discord/Slack — иконки ВНУТРИ
          контейнера ввода): скрепка слева и смайл/микрофон справа ЖИВУТ
          ВНУТРИ поля, поле от края до края, отправка — отдельно справа.
          При росте поля скрепка держится ВЕРХА, правые иконки — НИЗА
          (хореография Битрикс24, вердикт владельца 15.09.2026). Контур поля
          статичен (при фокусе не подсвечивается). */}
      <span className="flex min-w-0 flex-1 items-stretch gap-0.5 rounded-xl border border-input px-1 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn('shrink-0 text-muted-foreground', grown ? 'self-start' : 'self-center')}
          aria-label={ui.chat.attachFile}
          title={ui.chat.attachFile}
        >
          <Paperclip />
        </Button>
        {/* autoFocus: вход в чат = курсор сразу в композере (вердикт владельца
            14.09.2026: «не тыкаться мышкой»); key по conversationId в пейнах
            ремоунтит композер — фокус возвращается при каждой смене беседы.
            rows=1 + field-sizing-content: в покое ОДНА строка (текст и
            плейсхолдер по центру высоты), при вводе растёт до 45vh
            (≈половина окна — вердикт владельца 15.09.2026: «чтобы не
            появлялся вертикальный скролл»; безлимита нет: черновик на сотни
            строк не должен вытеснять ленту), дальше — скролл внутри поля. */}
        <Textarea
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          className="max-h-[45vh] min-h-7 flex-1 resize-none rounded-lg border-0 bg-transparent px-1.5 py-1 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
        <span className={cn('flex shrink-0 items-end gap-0.5', grown ? 'self-end' : 'self-center')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            aria-label={ui.chat.emoji}
            title={ui.chat.emoji}
          >
            <Smile />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground"
            aria-label={ui.chat.voice}
            title={ui.chat.voice}
          >
            <Mic />
          </Button>
        </span>
      </span>
      <SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
    </form>
  );
}
