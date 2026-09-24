import { Check, Mic, Paperclip, Smile } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { SendHexIcon } from '../ui/send-hex-icon.js';
import { chatAttachmentsEnabled } from './attachments-gate.js';
import {
  EMPTY_DRAFT,
  useChatDrafts,
  type EditDraft,
  type PendingAttachment,
  type ReplyDraft,
} from './chat-drafts.js';
import { ComposerAttachments } from './composer-attachments.js';
import { ComposerBanner } from './composer-banner.js';
import { ComposerClipMenu } from './composer-clip-menu.js';
import { addFiles } from './composer-files.js';
import { registerComposer, unregisterComposer } from './composer-focus.js';
import { flushDraftSync } from './draft-sync.js';
import { ForwardBanner } from './forward-banner.js';
import { useForwardPending } from './forward-pending.js';
import { useJumpStore } from './jump-store.js';
import { chatKeys } from './api.js';
import { useForwardMessages } from './message-mutations.js';
import { isSendShortcut } from './send-keys.js';
import { useScrollEndStore } from './scroll-end-store.js';
import { SelectionToolbar } from './selection-island.js';

/** Payload отправки композера (#87): текст + готовые вложения + контекст
 *  ответа/правки. Хост решает: edit ≠ null → мутация правки; иначе — отправка
 *  (attachmentIds/replyToId из payload). Пересылка (бар ForwardBanner)
 *  обрабатывается ВНУТРИ композера: текст = комментарий к блоку. */
export interface ComposerSubmit {
  text: string;
  attachments: PendingAttachment[];
  reply: ReplyDraft | null;
  edit: EditDraft | null;
}

/** Режим мультивыбора ленты (A6): композер СХЛОПЫВАЕТСЯ в узкий островок
 *  батч-команд (модель Bitrix24, вердикт 24.09: ввод в селекте не нужен,
 *  верхняя полоса двигала UI). Действия собирает хост (use-feed-selection). */
export interface ComposerSelection {
  count: number;
  allMine: boolean;
  onForward: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClear: () => void;
}

/** Рост поля против базовой строки (ResizeObserver) — хореография иконок. */
function useGrown(inputRef: RefObject<HTMLTextAreaElement | null>): boolean {
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
  }, [inputRef]);
  return grown;
}

/**
 * Композер сообщений (единый для чатов, каналов, тредов и обсуждений; файл
 * >300 строк — сборка ВСЕХ режимов композера по вердиктам 14–24.09, детали
 * вынесены: клип-меню `composer-clip-menu.tsx`, тулбар селекта
 * `selection-island.tsx`, бары `composer-banner.tsx`/`forward-banner.tsx`).
 * «Островок» ввода (rounded-2xl bg-card, тень-ступень) парит над тоном
 * chat-zone БЕЗ внешнего контура и разделителя (вердикт 24.09: модель
 * Bitrix24/Telegram — владелец: «бары режимов не должны растягивать кнопку
 * отправки»). Строки островка: бар ответа/правки, бар пересылки, трей
 * вложений, строка ввода (скрепка слева, поле, смайл и мик/отправка справа).
 * Отправка — ghost-кнопка с чистым гексагоном `SendHexIcon` БЕЗ заливки, в
 * семье смайл/мик (тон темнее), видна ТОЛЬКО при тексте/вложениях/баре
 * пересылки (пусто — микрофон-заглушка, модель Telegram: ввод голоса и
 * текста взаимоисключащи), в правке — галка; габарит один с миком (size-8 —
 * переключение не двигает строку). Enter — отправить, Shift/Ctrl+Enter —
 * перенос (вердикт 14.09.2026). Контур поля при фокусе НЕ подсвечивается.
 *
 * Линия A (#87): состояние — в drafts-сторе per focusId (черновик переживает
 * смену беседы + индикатор в списке); вставка файлов Ctrl+V; бары ответа-
 * цитаты и правки (взаимоисключающие, Esc-каскад — канон Discord: сначала
 * режимы композера, слайдер не закрываем); ↑ на пустом поле — правка
 * последнего своего (официальный шорткат Telegram). Пересылка: бар получателя
 * (forward-pending) — комментарий полем, отправка шлёт блок + комментарий
 * (модель Bitrix24). Селект ленты: островок сужается в узкий батч-островок и
 * расширяется обратно СИММЕТРИЧНО от центра (фазы normal/sel/exit: mx-auto
 * держится весь exit, тулбар живёт внутри до конца расширения — без пустой
 * фазы и развёртки «слева направо», баг-вердикт раунда 4).
 */
export function ChatComposer({
  placeholder,
  focusId,
  conversationId,
  onSubmit,
  attachmentsEnabled: attachmentsEnabledProp = false,
  onEditLast,
  selection = null,
  className,
}: {
  placeholder: string;
  /** Владелец «вечного курсора» (composer-focus) И ключ черновика (scope). */
  focusId: string;
  /** Беседа — для прыжка по клику на бар ответа. */
  conversationId?: string;
  onSubmit: (submit: ComposerSubmit) => void;
  /** Полный режим (мессенджер): скрепка-меню, вставка файлов, ↑-правка. */
  attachmentsEnabled?: boolean;
  /** ↑ на пустом поле: хост открывает правку последнего своего сообщения. */
  onEditLast?: () => void;
  /** Активный мультивыбор ленты: островок сужается до батч-команд. */
  selection?: ComposerSelection | null;
  className?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const islandRef = useRef<HTMLSpanElement>(null);

  // Гейт вложений (вердикт 25.09, до #57): запрос хоста действует только в
  // мок-режиме домена chat; в живом — скрепка/вставка выключены с подсказкой.
  const attachmentsEnabled = attachmentsEnabledProp && chatAttachmentsEnabled();

  const draft = useChatDrafts((s) => s.drafts[focusId] ?? EMPTY_DRAFT);
  const setText = useChatDrafts((s) => s.setText);
  const pending = useForwardPending((s) => s.pendings[focusId] ?? null);
  const sel = selection && selection.count > 0 ? selection : null;
  const forward = useForwardMessages();
  const text = draft.text;
  const grown = useGrown(inputRef);

  // Морфология островка: sel — узкий батч-островок; exit — он же, но ширина
  // уже полная (transition ведёт 288px→100% при mx-auto = симметрично от
  // центра), тулбар внутри до конца фазы; normal — облако ввода.
  const [selPhase, setSelPhase] = useState<'normal' | 'sel' | 'exit'>('normal');
  const lastSel = useRef<ComposerSelection | null>(null);
  useEffect(() => {
    if (sel) {
      lastSel.current = sel;
      setSelPhase('sel');
      return undefined;
    }
    setSelPhase((p) => (p === 'sel' ? 'exit' : p));
    return undefined;
  }, [sel]);
  useEffect(() => {
    if (selPhase !== 'exit') return undefined;
    const timer = window.setTimeout(() => setSelPhase('normal'), 220);
    return () => window.clearTimeout(timer);
  }, [selPhase]);
  const toolbarSel = selPhase === 'sel' ? sel : lastSel.current;

  // «Вечный курсор»: монтаж — композер активный владелец; размонтаж (закрыли
  // тред) — курсор возвращается ранее зарегистрированному (ленте канала).
  // Черновик восстановлен при смене беседы → каретка в КОНЕЦ текста при
  // ближайшем фокусе (модель Telegram: продолжаешь писать с места остановки;
  // вердикт 25.09 — каретка «у начала» заставляла переставлять её руками).
  const caretToEndRef = useRef(false);
  useEffect(() => {
    const restored = (useChatDrafts.getState().drafts[focusId]?.text ?? '').length;
    caretToEndRef.current = restored > 0;
    const el = inputRef.current;
    if (el && restored > 0) el.setSelectionRange(restored, restored);
  }, [focusId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    registerComposer(focusId, el);
    return () => unregisterComposer(focusId, el);
  }, [focusId]);

  // Черновик — ТОЛЬКО на уходе из беседы (вердикт владельца 25.09:
  // «онлайн-трансляция набранного текста не нужна»): во время набора сервер
  // молчит (метки/подъёма в списке во время набора нет); PUT — при
  // переключении беседы/размонтировании и при скрытии вкладки/закрытии
  // страницы (слушатели ухода ставятся при инициализации draft-sync). Режим
  // правки черновик не пишет вовсе. Флуш ПРЕДЫДУЩЕЙ беседы: React вызывает
  // ПРЕДЫДУЩИЙ cleanup и при смене focusId (композер переиспользуется при
  // переключении бесед внутри мессенджера), и при размонтировании — оба
  // случая = «ушёл из беседы». Инвалидация списка — ТОЛЬКО после завершения
  // PUT: одновременный refetch обгонял PUT и приходил без метки (дефект
  // приёмки 25.09 «метка появляется только при выходе из модуля»).
  const queryClient = useQueryClient();
  useEffect(() => {
    return () => {
      void flushDraftSync(focusId).then((sent) => {
        if (sent) void queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
      });
    };
  }, [focusId, queryClient]);

  const uploading = draft.attachments.some((a) => a.status === 'uploading');
  const readyAttachments = draft.attachments.filter((a) => a.status === 'ready' && a.attachment);
  const hasContent = text.trim().length > 0 || readyAttachments.length > 0;
  // Пересылка отправляется и без комментария (блок сам по себе ценен);
  // правка — только с непустым текстом; загрузка вложений держит обе.
  const canSubmit = draft.edit
    ? text.trim().length > 0
    : pending // пересылка без вложений — загрузка трей не блокирует
      ? true
      : hasContent && !uploading;
  // Telegram: отправки НЕТ до первого символа (на её месте микрофон);
  // бар пересылки кнопку показывает (комментарий опционален).
  const sendVisible = draft.edit ? text.trim().length > 0 : hasContent || pending !== null;

  function submit() {
    if (!canSubmit) return;
    const store = useChatDrafts.getState();
    if (draft.edit) {
      onSubmit({ text: text.trim(), attachments: [], reply: null, edit: draft.edit });
      store.finishEdit(focusId);
      return;
    }
    if (pending) {
      const target = pending;
      forward.mutate(
        {
          targetId: target.conversationId,
          body: {
            sourceConversationId: target.sourceConversationId,
            messageIds: target.messageIds,
            comment: text.trim() || undefined,
            threadRootId: target.threadRootId,
          },
        },
        {
          onSuccess: () => {
            useForwardPending.getState().clear(focusId);
            store.setText(focusId, '');
            toast.success(ui.chat.forwardDone);
          },
        },
      );
      useScrollEndStore.getState().request(focusId);
      return;
    }
    onSubmit({
      text: text.trim(),
      attachments: readyAttachments,
      reply: draft.reply,
      edit: null,
    });
    // Своё сообщение видно с любой позиции скролла (вердикт 24.09).
    useScrollEndStore.getState().request(focusId);
    store.clear(focusId);
  }

  function onSubmitForm(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSendShortcut(event.key, event.shiftKey, event.ctrlKey)) {
      event.preventDefault();
      submit();
      return;
    }
    // Esc-каскад (канон Discord): сначала режимы композера (пересылка —
    // верхний, самый сиюминутный); preventDefault не даёт SliderPanel закрыть
    // карточку (фильтр канона #71).
    if (event.key === 'Escape') {
      const store = useChatDrafts.getState();
      if (pending) {
        event.preventDefault();
        useForwardPending.getState().clear(focusId);
      } else if (draft.reply) {
        event.preventDefault();
        store.cancelReply(focusId);
      } else if (draft.edit) {
        event.preventDefault();
        store.cancelEdit(focusId);
      }
      return;
    }
    // ↑ на пустом поле — править последнее своё (официальный шорткат Telegram).
    if (
      event.key === 'ArrowUp' &&
      !event.shiftKey &&
      !ctrlOrAlt(event) &&
      text.length === 0 &&
      !draft.edit &&
      !draft.reply &&
      !pending &&
      onEditLast
    ) {
      event.preventDefault();
      onEditLast();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    // Гейт живого режима (вердикт 25.09): файлы не принимаются, вместо
    // ошибки — вежливая подсказка (та же, что на выключенной скрепке).
    if (!attachmentsEnabled) {
      toast(chatAttachmentsEnabled() ? ui.chat.attachFile : ui.chat.attachmentsUnavailable);
      return;
    }
    event.preventDefault();
    addFiles(focusId, files);
  }

  const align = grown ? 'self-end' : 'self-center';

  return (
    <form onSubmit={onSubmitForm} className={cn('shrink-0 bg-chat-zone px-3 py-2', className)}>
      {/* Островок ввода: ступень тона + тень вместо контура (вердикт 24.09) —
          бары режимов и трей вложений растут ВНУТРИ, строка ввода остаётся
          одной строкой фиксированной высоты. */}
      <span
        ref={islandRef}
        className={cn(
          'rounded-2xl bg-card shadow-sm transition-all duration-200',
          selPhase === 'sel'
            ? 'mx-auto flex w-72 items-center gap-0.5 px-2 py-1.5'
            : selPhase === 'exit'
              ? 'mx-auto flex w-full items-center gap-0.5 px-2 py-1.5'
              : 'flex w-full px-2 py-1.5',
        )}
      >
        {selPhase !== 'normal' && toolbarSel ? (
          <SelectionToolbar sel={toolbarSel} frozen={selPhase === 'exit'} />
        ) : (
          <span className="flex w-full flex-col gap-1">
            {draft.reply || draft.edit ? (
              <ComposerBanner
                draft={draft}
                onCancel={() => {
                  const store = useChatDrafts.getState();
                  if (draft.edit) store.cancelEdit(focusId);
                  else store.cancelReply(focusId);
                }}
                onJump={
                  draft.reply && conversationId
                    ? () =>
                        useJumpStore
                          .getState()
                          .request(
                            conversationId,
                            draft.reply?.messageId ?? '',
                            draft.reply?.inThread,
                          )
                    : undefined
                }
              />
            ) : null}
            {pending ? (
              <ForwardBanner
                pending={pending}
                onCancel={() => useForwardPending.getState().clear(focusId)}
              />
            ) : null}
            {attachmentsEnabled ? (
              <ComposerAttachments draftKey={focusId} items={draft.attachments} />
            ) : null}
            <span className="flex items-end gap-0.5">
              {attachmentsEnabled ? (
                <ComposerClipMenu
                  draftKey={focusId}
                  islandRef={islandRef}
                  align={align}
                  disabled={pending !== null}
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('shrink-0 text-muted-foreground', align)}
                  // Живой режим до хранилища файлов (вердикт 25.09): скрепка на
                  // месте, но с подсказкой вместо ошибки загрузки.
                  aria-label={
                    attachmentsEnabledProp ? ui.chat.attachmentsUnavailable : ui.chat.attachFile
                  }
                  title={
                    attachmentsEnabledProp ? ui.chat.attachmentsUnavailable : ui.chat.attachFile
                  }
                  disabled
                >
                  <Paperclip strokeWidth={1.75} />
                </Button>
              )}
              {/* autoFocus: вход в чат = курсор сразу в композере (вердикт
                  14.09.2026); rows=1 + field-sizing: рост до 45vh, дальше
                  скролл внутри поля (вердикт 15.09.2026). */}
              <Textarea
                ref={inputRef}
                autoFocus
                value={text}
                onFocus={() => {
                  const el = inputRef.current;
                  if (caretToEndRef.current && el) {
                    el.setSelectionRange(el.value.length, el.value.length);
                  }
                  caretToEndRef.current = false;
                }}
                onChange={(e) => setText(focusId, e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={placeholder}
                rows={1}
                className="max-h-[45vh] min-h-8 flex-1 resize-none rounded-lg border-0 bg-transparent px-1.5 py-1.5 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('shrink-0 text-muted-foreground', align)}
                aria-label={ui.chat.emoji}
                title={ui.chat.emoji}
              >
                <Smile strokeWidth={1.75} />
              </Button>
              {/* Отправка/галка и мик — ОДИН габарит ghost-кнопки (size-8):
                  переключение не двигает строку; заливки НЕТ — гексагон в
                  семье значков, тон темнее (вердикт 24.09, раунды 4–5). */}
              {sendVisible ? (
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  /* Акцент info — тот же токен, что закреп/цитаты/бар
                     пересылки (вердикт 24.09: «нравится цвет цитат и
                     закрепов»; смена оттенка акцента = одна строка темы). */
                  className={cn('shrink-0 text-info', align)}
                  aria-label={draft.edit ? ui.common.save : ui.tasks.send}
                  title={draft.edit ? ui.common.save : ui.tasks.send}
                >
                  {draft.edit ? (
                    <Check className="size-5" strokeWidth={2} />
                  ) : (
                    <SendHexIcon className="size-5" />
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn('shrink-0 text-muted-foreground', align)}
                  aria-label={ui.chat.voice}
                  title={ui.chat.voice}
                  onClick={() => toast(ui.chat.voiceSoon)}
                >
                  <Mic strokeWidth={1.75} />
                </Button>
              )}
            </span>
          </span>
        )}
      </span>
    </form>
  );
}

function ctrlOrAlt(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.ctrlKey || event.altKey;
}
