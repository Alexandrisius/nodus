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
import { addFiles, cancelUpload, removePending, replaceFile } from './composer-files.js';
import { cancelMessageEdit } from './message-edit.js';
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
  // Режим правки (#188): окно редактирует существующее сообщение — текст и
  // состав; «Сохранить» = PATCH с полным составом, отмена не трогает сообщение.
  const editMode = draft.edit !== null;
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // «Заменить вложение» (#188): строка, на которую подменяет следующий
  // выбранный файл (скрытый инпут окна один на все источники).
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  // Инлайн-правка имени строки (#188, вердикт владельца 04.10): супер-курсор
  // временно погашен — каретка в поле имени; после применения/отката —
  // возврат в подпись. Ref — чтобы фокус-хендлеры без ре-рендера видели.
  const [renameActive, setRenameActive] = useState(false);
  const renameActiveRef = useRef(false);
  renameActiveRef.current = renameActive;
  const draggingRef = useRef<string | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleRenameMode(active: boolean) {
    setRenameActive(active);
    if (!active) refocusCaption();
  }

  // Картинки окна — локальные objectURL новых загрузок ИЛИ серверные
  // превью строк правимого сообщения (#188); лайтбокс смотрит их же.
  const previewImages: MessageAttachment[] = items.flatMap((item): MessageAttachment[] => {
    if (item.objectUrl) {
      return [
        {
          id: item.localId,
          fileId: item.attachment?.fileId ?? '',
          name: item.fileName,
          size: item.size,
          mime: item.mime,
          kind: 'image',
          url: item.objectUrl,
          thumbnailUrl: item.objectUrl,
          previewKind: 'image',
          pdfUrl: null,
          width: null,
          height: null,
        },
      ];
    }
    // Строка правимого сообщения: DTO с серверными url/превью.
    return item.attachment ? [{ ...item.attachment, name: item.fileName }] : [];
  });
  const previewIndex = (localId: string) => previewImages.findIndex((p) => p.id === localId);
  const hasPreview = (item: (typeof items)[number]) =>
    Boolean(item.objectUrl || item.attachment?.thumbnailUrl || item.attachment?.url);

  // Отправка встала (хост очистил черновик по onSuccess) или вложения сняты
  // все до одной — окно закрывается само. Снятие последней строки = отмена:
  // подпись возвращается черновиком в композер (валидатор #144: текст не
  // должен теряться); на пути отправки подпись съедена сообщением. В режиме
  // ПРАВКИ (#188) пустой состав — легальное состояние (сообщение с одним
  // текстом): окно не закрывается, edit сбрасывается только сохранением.
  useEffect(() => {
    if (scope && items.length === 0 && !editMode) {
      if (!sending) {
        const leftover = useAttachSendDialog.getState().caption;
        if (leftover) useChatDrafts.getState().setText(scope, leftover);
      }
      setSending(false);
      close();
    }
  }, [scope, items.length, editMode, sending, close]);

  if (!scope) return null;

  const uploading = items.some((item) => item.status === 'uploading');
  const errored = items.some((item) => item.status === 'error');
  const limit = messageLimitState(caption.length);
  const readyCount = items.filter((item) => item.status === 'ready').length;
  const canSend =
    (editMode ? caption.trim().length > 0 || readyCount > 0 : items.length > 0) &&
    !uploading &&
    !errored &&
    !limit.over &&
    !sending;

  /** Отмена (Esc/«Отмена»): правка — сообщение не тронуто (исходные строки
   *  отвязаны только локально, новые загрузки сняты, текст композера
   *  восстановлен); отправка — загрузки сняты, готовые объекты удалены,
   *  подпись возвращается черновиком в композер (канон Telegram). */
  function cancelAll() {
    // В полёте отправки отмена выключена (валидатор #144): DELETE готовых
    // вложений при уходящем сообщении ломал бы отправку.
    if (!scope || sending) return;
    if (draft.edit) {
      cancelMessageEdit(scope);
      close();
      return;
    }
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
      edit: draft.edit,
      editComposition: editMode,
    };
    const promise = submitForScope(scope, payload);
    if (!promise) return;
    setSending(true);
    if (!editMode) {
      // Своё сообщение видно с любой позиции скролла (вердикт 24.09); правка
      // сообщения на месте скролл не двигает.
      useScrollEndStore.getState().request(scope, 'smooth');
    }
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

  /** Фокус подписи с кареткой В КОНЦЕ текста (#241): при открытии окна текст
   *  композера уже переехал в подпись — «начало строки» заставляло вручную
   *  переносить курсор, чтобы продолжить писать. Единая точка для всех
   *  возвратов фокуса (открытие, кража клика, drag-сортировка, лайтбокс). */
  function focusCaption() {
    const el = captionRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }

  /** Страховка супер-курсора: каретка вернётся в подпись, если фокус ушёл
   *  в никуда (body) — кадром позже (drag-ручка фокус не забирает). */
  function refocusCaption() {
    requestAnimationFrame(() => {
      if (!useAttachSendDialog.getState().scope) return;
      if (renameActiveRef.current) return;
      focusCaption();
    });
  }

  /** Супер-курсор окна (#144, вердикт 29.09.2026): любой клик вне полей ввода
   *  возвращает мигающую каретку в подпись — как «вечный курсор» чата.
   *  Исключение — правка имени строки (#188, вердикт владельца 04.10):
   *  курсор временно погашен, клики фокус не воруют. */
  function stealCaret(event: React.MouseEvent) {
    if (renameActiveRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest('textarea, input, [contenteditable="true"]')) return;
    focusCaption();
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
        onEscapeKeyDown={(event) => {
          // Esc в поле имени гасит только правку имени — окно живо (#188):
          // Radix ловит keydown на document (capture) раньше поля, поэтому
          // подавляем ЗАКРЫТИЕ здесь, откат делает само поле.
          if (renameActiveRef.current) event.preventDefault();
        }}
        onClick={stealCaret}
        onOpenAutoFocus={(event) => {
          // Супер-курсор окна: набор текста начинается сразу в подписи —
          // каретка В КОНЦЕ уже написанного текста (#241).
          event.preventDefault();
          focusCaption();
        }}
        onBlur={() => {
          // Супер-курсор НЕ ПРОПАДАЕТ: каретка живёт в подписи всё время,
          // пока окно открыто. Ушла в никуда (body) или на НЕ-поле внутри
          // окна (кнопка строки/ручка drag) — возвращаем (тайминг — как в
          // refocusCaption, позже 50-мс окна очистки dnd-kit). Внешний слой
          // (лайтбокс превью) фокусом владеет — не трогаем. Правка имени
          // строки — каретка в поле имени, не воруем (#188).
          if (renameActiveRef.current) return;
          const active = document.activeElement as HTMLElement | null;
          if (active?.closest('textarea, input, [contenteditable="true"]')) return;
          if (active && active !== document.body && !active.closest('[data-slot="dialog-content"]'))
            return;
          refocusCaption();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {editMode
              ? ui.chat.editTitle
              : `${ui.chat.attachSelected} ${items.length} ${plural(items.length, [ui.chat.fileOne, ui.chat.fileFew, ui.chat.fileMany])}`}
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
              actions={editMode}
              onRenameMode={handleRenameMode}
              onReplace={() => {
                // «Заменить вложение» (#188): выбор файла подменяет цель
                // скрытого инпута окна (обычное «Добавить» не трогаем).
                setReplaceTarget(item.localId);
                fileRef.current?.click();
              }}
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
                hasPreview(item) ? () => setLightbox(previewIndex(item.localId)) : undefined
              }
            />
          ))}
        </ul>
        <Textarea
          ref={captionRef}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onPaste={(event) => {
            // Ctrl+V в окне добавляет вложение (в правке — НЕ новое
            // сообщение, #188; в отправке — тот же канон Telegram).
            const files = Array.from(event.clipboardData.files);
            if (files.length === 0) return;
            event.preventDefault();
            addFiles(scope, files);
          }}
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
            {editMode ? ui.common.save : ui.chat.attachSend}
          </Button>
        </DialogFooter>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (scope && event.target.files) {
              // Замена (#188): один файл на место строки-цели; иначе —
              // обычное добавление («Добавить», дроп, Ctrl+V).
              const files = Array.from(event.target.files);
              if (replaceTarget !== null) {
                const [file] = files;
                if (file) replaceFile(scope, replaceTarget, file);
                setReplaceTarget(null);
              } else {
                addFiles(scope, files);
              }
            }
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
            focusCaption();
          }}
        />
      ) : null}
    </Dialog>
  );
}
