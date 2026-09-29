import { Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MessageAttachment } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { Textarea } from '@nodus/ui/components/textarea';

import { plural } from '../lib/format.js';
import { AttachSendRow } from './attach-send-row.js';
import { messageLimitState, type ComposerSubmit } from './chat-composer.js';
import { EMPTY_DRAFT, useChatDrafts } from './chat-drafts.js';
import { addFiles, cancelUpload, removePending } from './composer-files.js';
import { useAttachSendDialog } from './dialog-stores.js';
import { ImageLightbox } from './image-lightbox.js';
import { useScrollEndStore } from './scroll-end-store.js';
import { isSendShortcut } from './send-keys.js';
import { submitForScope } from './submit-registry.js';

/**
 * Окно отправки вложений (#144, референсы Telegram/Bitrix, вердикт владельца
 * 29.09.2026): любое прикрепление открывает окно вместо трея у строки ввода.
 * Строки — превью/иконка, имя, размер, drag-сортировка за точки, снятие;
 * «Добавить» — ещё файлы; подпись — ОТДЕЛЬНОЕ поле окна (не дублируется
 * онлайн в композер; отмена возвращает текст черновиком — семантика
 * Telegram). Футер БЕЗ разделителей (канон nodus-ui §37): Добавить / Отмена
 * / Отправить. Отправка — через реестр submit-функций хостов
 * (submit-registry): оптимистичность, reply и threadRootId не дублируются.
 * Ошибка отправки окно НЕ закрывает — файлы и текст живы, повтор возможен
 * (#123). Супер-курсор: при открытии фокус на подписи, drag-ручка фокус не
 * забирает (каретка живёт и во время сортировки), после закрытия — возврат
 * в композер (dialog-hosts).
 */
export function AttachSendDialogHost() {
  const scope = useAttachSendDialog((s) => s.scope);
  const close = useAttachSendDialog((s) => s.close);
  const caption = useAttachSendDialog((s) => s.caption);
  const setCaption = useAttachSendDialog((s) => s.setCaption);
  const draft = useChatDrafts((s) => (scope ? (s.drafts[scope] ?? EMPTY_DRAFT) : EMPTY_DRAFT));
  const items = draft.attachments;
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Картинки окна — локальные objectURL до отправки; лайтбокс смотрит их же.
  const previewImages: MessageAttachment[] = items
    .filter((item) => item.objectUrl)
    .map((item) => ({
      id: item.localId,
      fileId: item.attachment?.fileId ?? '',
      name: item.fileName,
      size: item.size,
      mime: item.mime,
      kind: 'image',
      url: item.objectUrl ?? '',
      thumbnailUrl: item.objectUrl,
      width: null,
      height: null,
    }));

  // Отправка встала (хост очистил черновик по onSuccess) или вложения сняты
  // все до одной — окно закрывается само. Снятие последней строки = отмена:
  // подпись возвращается черновиком в композер (валидатор #144: текст не
  // должен теряться); на пути отправки подпись съедена сообщением.
  useEffect(() => {
    if (scope && items.length === 0) {
      if (!sending) {
        const leftover = useAttachSendDialog.getState().caption;
        if (leftover) useChatDrafts.getState().setText(scope, leftover);
      }
      setSending(false);
      close();
    }
  }, [scope, items.length, sending, close]);

  if (!scope) return null;

  const uploading = items.some((item) => item.status === 'uploading');
  const errored = items.some((item) => item.status === 'error');
  const limit = messageLimitState(caption.length);
  const canSend = items.length > 0 && !uploading && !errored && !limit.over && !sending;

  /** Отмена (крестик/Esc/задник/«Отмена»): загрузки сняты, готовые объекты
   *  удалены на сервере, ПОДПИСЬ возвращается в композер — становится
   *  черновиком (канон Telegram: текст появляется в чате только после
   *  закрытия окна, не онлайн-дублированием). */
  function cancelAll() {
    // В полёте отправки отмена выключена (валидатор #144): DELETE готовых
    // вложений при уходящем сообщении ломал бы отправку.
    if (!scope || sending) return;
    if (caption) useChatDrafts.getState().setText(scope, caption);
    const current = (useChatDrafts.getState().drafts[scope] ?? EMPTY_DRAFT).attachments;
    for (const item of current) {
      if (item.status === 'uploading') cancelUpload(scope, item.localId);
      else removePending(scope, item.localId);
    }
    useChatDrafts.getState().clearAttachments(scope);
    close();
  }

  async function send() {
    if (!scope || !canSend) return;
    const payload: ComposerSubmit = {
      text: caption.trim(),
      attachments: items,
      reply: draft.reply,
      edit: null,
    };
    const promise = submitForScope(scope, payload);
    if (!promise) return;
    setSending(true);
    // Своё сообщение видно с любой позиции скролла (вердикт 24.09).
    useScrollEndStore.getState().request(scope, 'smooth');
    try {
      await promise;
    } catch {
      // Тост сетевой ошибки — от мутации хоста; окно остаётся открытым.
      setSending(false);
    }
  }

  // Живой реордер БЕЗ dnd-kit (вердикт 29.09.2026): PointerSensor dnd-kit
  // подавляет каретку/выделение в полях на всё время drag — супер-курсор
  // подписи умирал. Наша механика: строки меняются местами в DOM прямо во
  // время drag по elementsFromPoint, ничего не уезжает за пределы списка.
  function handleDragMove(x: number, y: number) {
    const dragging = draggingRef.current;
    if (!scope || !dragging) return;
    const under = (document.elementsFromPoint(x, y) as HTMLElement[])
      .map((el) => el.closest('[data-attach-row]'))
      .find(Boolean) as HTMLElement | undefined;
    const overId = under?.dataset.attachRow;
    if (!overId || overId === dragging) return;
    const itemsNow = (useChatDrafts.getState().drafts[scope] ?? EMPTY_DRAFT).attachments;
    const from = itemsNow.findIndex((i) => i.localId === dragging);
    const to = itemsNow.findIndex((i) => i.localId === overId);
    if (from >= 0 && to >= 0) useChatDrafts.getState().reorderAttachments(scope, from, to);
  }

  /** Страховка супер-курсора: каретка вернётся в подпись, если фокус ушёл
   *  в никуда (body) — кадром позже (drag-ручка фокус не забирает). */
  function refocusCaption() {
    requestAnimationFrame(() => {
      if (!useAttachSendDialog.getState().scope) return;
      captionRef.current?.focus({ preventScroll: true });
    });
  }

  /** Супер-курсор окна (#144, вердикт 29.09.2026): любой клик вне полей ввода
   *  возвращает мигающую каретку в подпись — как «вечный курсор» чата. */
  function stealCaret(event: React.MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('textarea, input, [contenteditable="true"]')) return;
    captionRef.current?.focus({ preventScroll: true });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Пока открыт лайтбокс превью, внешние клики модала (pointerdown
        // мимо контента) не отменяют окно (валидатор #144).
        if (!open && lightbox !== null) return;
        if (!open) cancelAll();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        /* Крестик окна НЕ нужен (вердикт 29.09.2026): отмена — кнопкой
           «Отмена» в футере; крестики остаются ТОЛЬКО на строках вложений. */
        showCloseButton={false}
        /* Клик снаружи НЕ закрывает окно (#148, владелец 29.09: «опасный
           баг — теряются вложения и текст»): случайный мимо-клик не может
           уничтожить работу. Отмена — только намеренная: «Отмена» или Esc;
           референсы Telegram/Битрикс тоже не закрывают окно по заднику. */
        onInteractOutside={(event) => event.preventDefault()}
        onClick={stealCaret}
        onOpenAutoFocus={(event) => {
          // Супер-курсор окна: набор текста начинается сразу в подписи.
          event.preventDefault();
          captionRef.current?.focus({ preventScroll: true });
        }}
        onBlur={() => {
          // Супер-курсор НЕ ПРОПАДАЕТ: каретка живёт в подписи всё время,
          // пока окно открыто. Ушла в никуда (body) или на НЕ-поле внутри
          // окна (кнопка строки/ручка drag) — возвращаем (тайминг — как в
          // refocusCaption, позже 50-мс окна очистки dnd-kit). Внешний слой
          // (лайтбокс превью) фокусом владеет — не трогаем.
          const active = document.activeElement as HTMLElement | null;
          if (active?.closest('textarea, input, [contenteditable="true"]')) return;
          if (active && active !== document.body && !active.closest('[data-slot="dialog-content"]'))
            return;
          refocusCaption();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {ui.chat.attachSelected} {items.length}{' '}
            {plural(items.length, [ui.chat.fileOne, ui.chat.fileFew, ui.chat.fileMany])}
          </DialogTitle>
        </DialogHeader>
        {/* Фиксированные границы зоны списка: габарит окна не прыгает
            (канон nodus-ui §39). */}
        <ul className="flex min-h-14 max-h-[45vh] flex-col gap-1 overflow-x-hidden overflow-y-auto pr-1">
          {items.map((item) => (
            <AttachSendRow
              key={item.localId}
              scope={scope}
              item={item}
              dragging={draggingId === item.localId}
              onDragStart={() => {
                draggingRef.current = item.localId;
                setDraggingId(item.localId);
              }}
              onDragMove={handleDragMove}
              onDragEnd={() => {
                draggingRef.current = null;
                setDraggingId(null);
              }}
              onPreview={
                item.objectUrl
                  ? () => setLightbox(previewImages.findIndex((p) => p.id === item.localId))
                  : undefined
              }
            />
          ))}
        </ul>
        <Textarea
          ref={captionRef}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onKeyDown={(event) => {
            // Клавиатура — КАК в композере чата (send-keys.ts, вердикт
            // 14.09.2026): Enter отправляет, Shift/Ctrl+Enter — перенос.
            if (isSendShortcut(event.key, event.shiftKey, event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={ui.chat.attachCaption}
          rows={2}
          /* Канон чатов: спокойная рамка поля ЕСТЬ, но фокус НЕ подсвечивает
             зону (ни белого бордера, ни кольца) — супер-курор без подсветки
             (вердикты 29.09.2026: и подсветка, и голое поле без рамки — нет). */
          className="min-h-16 resize-none focus-visible:border-input focus-visible:ring-0"
        />
        {limit.counter ? (
          <p className={limit.over ? 'text-xs text-danger' : 'text-xs text-muted-foreground'}>
            {limit.counter}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
            {ui.common.add}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelAll}>
            {ui.common.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            title={uploading ? ui.chat.attachWaitUpload : undefined}
          >
            {ui.chat.attachSend}
          </Button>
        </DialogFooter>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (scope && event.target.files) addFiles(scope, Array.from(event.target.files));
            event.target.value = '';
          }}
        />
      </DialogContent>
      {/* Просмотр картинки поверх окна (вердикт 29.09.2026): закрыл лайтбокс —
          вернулся В окно отправки продолжать (каретка — в подписи). */}
      {lightbox !== null ? (
        <ImageLightbox
          images={previewImages}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => {
            setLightbox(null);
            captionRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </Dialog>
  );
}
