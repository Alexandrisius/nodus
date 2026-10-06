import { Check, Mic, Paperclip, Smile } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Textarea } from '@nodus/ui/components/textarea';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { SendHexIcon } from '../ui/send-hex-icon.js';
import { emitTyping } from '../socket/typing-emitter.js';
import { useComposerInputActions, useGrown } from './composer-input-utils.js';
import { useSelectionPhase } from './selection-phase.js';
import {
  EMPTY_DRAFT,
  useChatDrafts,
  type EditDraft,
  type PendingAttachment,
  type ReplyDraft,
} from './chat-drafts.js';
import { MediaPickerButton } from './media-picker.js';
import { ComposerUrgentButton } from './composer-urgent.js';
import { useComposerSendError } from './composer-errors.js';
import { ComposerBanner } from './composer-banner.js';
import { ComposerClipMenu } from './composer-clip-menu.js';
import { registerComposer, unregisterComposer, focusComposer } from './composer-focus.js';
import { flushDraftSync } from './draft-sync.js';
import { ForwardBanner } from './forward-banner.js';
import { useForwardPending } from './forward-pending.js';
import { useJumpStore } from './jump-store.js';
import { chatKeys } from './api.js';
import { useForwardMessages } from './message-mutations.js';
import { useScrollEndStore } from './scroll-end-store.js';
import { SelectionToolbar } from './selection-island.js';
import type { StickerSubmitPayload } from './sticker-api.js';
import { MentionAutocompletePanel, useComposerMentions } from './composer-mention-autocomplete.js';
import { composerKeyDown } from './composer-keydown.js';
import { mentionIndexAtOffset, toWireText } from './composer-mention-registry.js';
import { MentionFieldOverlay, type MentionHit } from './composer-mention-overlay.js';

/** Payload отправки композера (#87): текст + готовые вложения + контекст
 *  ответа/правки. Хост решает: edit ≠ null → мутация правки; иначе — отправка
 *  (attachmentIds/replyToId из payload). Пересылка (бар ForwardBanner)
 *  обрабатывается ВНУТРИ композера: текст = комментарий к блоку.
 *  Стикер (#143) — отдельный payload: поле приоритетнее текста (отправка
 *  кликом из вкладки стикеров, мимо textarea).
 *  editComposition (#188): правка пришла из ОКНА вложений — payload несёт
 *  полный итоговый состав (attachmentIds/renames); инлайн-правка композера
 *  (флаг не задан) меняет только текст. */
export interface ComposerSubmit {
  text: string;
  attachments: PendingAttachment[];
  reply: ReplyDraft | null;
  edit: EditDraft | null;
  editComposition?: boolean;
  sticker?: StickerSubmitPayload | null;
  /** «Важное» (#177): молния композера; requireAck — чекбокс подтверждения
   *  (осмыслен только с urgent, сервер клампит). */
  urgent?: boolean;
  requireAck?: boolean;
}

/** Лимит текста сообщения (контракт text.max(4000), спека): превалидация в
 *  композере (раунд 3) — серверный 422 не должен съедать текст. */
export const MESSAGE_TEXT_LIMIT = 4000;
/** Счётчик виден, когда до лимита ближе этого порога. */
export const MESSAGE_TEXT_COUNTER_FROM = 3500;

/** Состояние превалидации длины (чистая функция — unit-тесты на границе). */
export function messageLimitState(length: number): { over: boolean; counter: string | null } {
  return {
    over: length > MESSAGE_TEXT_LIMIT,
    counter: length > MESSAGE_TEXT_COUNTER_FROM ? `${length} / ${MESSAGE_TEXT_LIMIT}` : null,
  };
}

/** Режим мультивыбора ленты (A6): композер СХЛОПЫВАЕТСЯ в узкий островок
 *  батч-команд (модель Bitrix24, вердикт 24.09: ввод в селекте не нужен,
 *  верхняя полоса двигала UI). Действия собирает хост (use-feed-selection). */
export interface ComposerSelection {
  count: number;
  /** Выделенные id в порядке ленты (#171: порядок цепочки = порядок «Заметок»). */
  ids: string[];
  allMine: boolean;
  /** Корзина доступна, когда всё выделенное можно удалить: в обычных лентах
   *  это «все свои» (allMine, tdesktop); витрина «Избранного» удаляет ЛЮБУЮ
   *  строку (запись — удалить, карточку — снять звезду, #215). */
  deletable?: boolean;
  /** Витрина «Избранного» (#215): пересылка островка — только записи (id
   *  карточек живут в чужих беседах, сервер форварда ищет источники в одной
   *  беседе-источнике; карточка пересылается ПКМ из исходной беседы).
   *  false — кнопки «Переслать» нет. */
  forwardable?: boolean;
  /** Витрина «Заметок»: звезда-цепочка скрыта (self-reference, #171). */
  favoritesEnabled?: boolean;
  onForward: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onClear: () => void;
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
  typingThreadRootId = null,
  onSubmit,
  attachmentsEnabled: attachmentsEnabledProp = false,
  /** Стикеры (#143): хосты на чужом API (обсуждение задачи — tasks) их не
   *  поддерживают; по умолчанию включены вместе с чат-конвейером. */
  stickersEnabled = true,
  onEditLast,
  selection = null,
  disabledPlaceholder = null,
  /** Молния «Важное» (#177): false — кнопки нет (Заметки — чат с собой). */
  urgentEnabled = true,
  className,
}: {
  placeholder: string;
  /** Владелец «вечного курсора» (composer-focus) И ключ черновика (scope). */
  focusId: string;
  /** Беседа — для прыжка по клику на бар ответа. */
  conversationId?: string;
  /** Печать В ТРЕДЕ (раунд 3): индикатор — шапка окна треда, не список бесед. */
  typingThreadRootId?: string | null;
  onSubmit: (submit: ComposerSubmit) => void;
  /** Полный режим (мессенджер): скрепка-меню, вставка файлов, ↑-правка. */
  attachmentsEnabled?: boolean;
  /** Стикеры вкладки пикера (#143): false — вкладка недоступна (task-хост). */
  stickersEnabled?: boolean;
  /** ↑ на пустом поле: хост открывает правку последнего своего сообщения. */
  onEditLast?: () => void;
  /** Активный мультивыбор ленты: островок сужается до батч-команд. */
  selection?: ComposerSelection | null;
  /** Гейт прав (каналы без post): строка-заглушка ВНУТРИ островка (#130
   *  изоморфизм + #132 р.8): выход из селекта морфится в заглушку той же
   *  анимацией (288px→100%), а не мгновенной подменой компонента. */
  disabledPlaceholder?: string | null;
  /** Молния «Важное» (#177): false — кнопки нет (Заметки). */
  urgentEnabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const islandRef = useRef<HTMLSpanElement>(null);

  // Хост-разрешение на вложения (панельные исключения передают false);
  // файловое хранилище (#57) сняло гейт живого режима — скрепка работает
  // и на моках, и вживую.
  const attachmentsEnabled = attachmentsEnabledProp;

  const draft = useChatDrafts((s) => s.drafts[focusId] ?? EMPTY_DRAFT);
  const setText = useChatDrafts((s) => s.setText);
  const pending = useForwardPending((s) => s.pendings[focusId] ?? null);
  const sel = selection && selection.count > 0 ? selection : null;
  const forward = useForwardMessages();
  const text = draft.text;
  const grown = useGrown(inputRef);

  // @упоминания (#176): каретка + запрос — useComposerMentions; клик по чипу
  // поля — поповер правки (composer-mention-overlay).
  const [editToken, setEditToken] = useState<MentionHit | null>(null);
  const mentions = useComposerMentions({ conversationId, focusId, text, setText, inputRef });
  // Реестр чипов черновика (#228): в поле ВИДИМЫЙ текст, каретка нативная.
  const draftMentions = draft.mentions ?? [];

  // Морфология островка (селект) — хук selection-phase.ts (I5, #177).
  const { selPhase, toolbarSel } = useSelectionPhase(sel);

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

  // «Вечный курсор» — регистрация РЕФ-КОЛБЭКОМ, не эффектом на [focusId]
  // (#104 раунд 2, баг «супер-курсора»): селект-режим РАЗМОНТИРУЕТ textarea
  // (островок батч-команд), выход — монтирует НОВЫЙ элемент; эффект с deps
  // [focusId] не перезапускался, registry хранил отсоединённый узел, focus()
  // на нём молча не работал — после «Ответить»/«Редактировать» каретка
  // умирала до смены беседы (ремаунт композера). Реф-колбэк честно
  // пере-регистрирует КАЖДЫЙ монтаж textarea. (autoFocus нового элемента
  // маскировал баг сразу после выхода из селекта.)
  const registerInput = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (el) {
        inputRef.current = el;
        registerComposer(focusId, el);
        return;
      }
      const prev = inputRef.current;
      inputRef.current = null;
      if (prev) unregisterComposer(focusId, prev);
    },
    [focusId],
  );

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
  // Превалидация лимита (раунд 3): счётчик у черты, отправка заблокирована,
  // текст НЕ теряется (остаётся в поле/черновике — серверного 422 нет).
  // Лимит/счётчик — по WIRE-длине (отправляемое = измеряемое, ревью #228):
  // display короче wire на накладные расходы токенов (~46 симв./чип) —
  // display-замер пропускал бы к отправке 422.
  const limit = messageLimitState(toWireText(text, draftMentions).length);
  // Инлайн-ошибка 409 политики важных (#177): стоит рядом с молнией до
  // следующей попытки отправки (гасится в onMutate мутации).
  const sendError = useComposerSendError(focusId);
  // Пересылка отправляется и без комментария (блок сам по себе ценен);
  // правка — только с непустым текстом; загрузка вложений держит обе.
  const canSubmit = draft.edit
    ? text.trim().length > 0 && !limit.over
    : pending // пересылка без вложений — загрузка трей не блокирует
      ? !limit.over
      : hasContent && !uploading && !limit.over;
  // Telegram: отправки НЕТ до первого символа (на её месте микрофон);
  // бар пересылки кнопку показывает (комментарий опционален).
  const sendVisible = draft.edit ? text.trim().length > 0 : hasContent || pending !== null;

  // Догон ленты (вердикт 24.09): одиночная своя отправка — ПЛАВНО; быстрая
  // серия — мгновенно (smooth на каждую пачку = «дёргание», раунд 3).
  const lastSendAt = useRef(0);
  function requestScrollEnd(): void {
    const now = Date.now();
    const burst = now - lastSendAt.current < 1500;
    lastSendAt.current = now;
    useScrollEndStore.getState().request(focusId, burst ? 'auto' : 'smooth');
  }

  function submit() {
    if (!canSubmit) return;
    if (draft.edit) {
      // Черновик/режим правки чистит хост по onSuccess мутации (#124):
      // ошибка сервера не должна терять набранную правку.
      onSubmit({
        text: toWireText(text, draftMentions).trim(),
        attachments: [],
        reply: null,
        edit: draft.edit,
      });
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
            comment: toWireText(text, draftMentions).trim() || undefined,
            threadRootId: target.threadRootId,
          },
        },
        {
          onSuccess: () => {
            useForwardPending.getState().clear(focusId);
            useChatDrafts.getState().setText(focusId, '');
            toast.success(ui.chat.forwardDone);
            // Догон и фокус приёмника — ПОСЛЕ успеха (раунд 3): раньше нонс
            // ставился до ответа сервера и гасился о невставшие сообщения.
            useScrollEndStore.getState().request(focusId, 'smooth');
            focusComposer(focusId);
          },
        },
      );
      return;
    }
    onSubmit({
      text: toWireText(text, draftMentions).trim(),
      attachments: readyAttachments,
      reply: draft.reply,
      edit: null,
      // Молния (#177): флаги летят с отправкой; сброс — очисткой черновика
      // onSuccess (мутация). Ошибка 409 политики — черновик жив, молния на месте.
      urgent: draft.urgent,
    });
    // Своё сообщение видно с любой позиции скролла (вердикт 24.09).
    // Черновик чистит хост по onSuccess отправки (#124): сетевой сбой
    // оставляет текст в композере (аудит #123: потерянного текста нет).
    requestScrollEnd();
  }

  // Ввод-действия (эмодзи/стикер/paste) — хук composer-input-utils.ts.
  const { insertEmoji, pickSticker, onPaste } = useComposerInputActions({
    focusId,
    conversationId,
    typingThreadRootId,
    text,
    inputRef,
    attachmentsEnabled,
    setText,
    onSubmit,
    requestScrollEnd,
  });

  function onSubmitForm(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  // Клавиатура поля — composer-keydown.ts (I5-сплит): атомарные клавиши
  // чипа, автокомплит, отправка, Esc-каскад режимов, ↑-правка последнего.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) =>
    composerKeyDown(event, {
      focusId,
      text,
      mentions: draftMentions,
      removeMention: (index) => useChatDrafts.getState().removeMention(focusId, index),
      autocomplete: {
        open: mentions.open,
        count: mentions.autocomplete.candidates.length,
        active: mentions.autocomplete.active,
        setActive: mentions.autocomplete.setActive,
        pick: mentions.pick,
        dismiss: mentions.dismiss,
      },
      submit,
      pendingForward: pending !== null,
      hasReply: draft.reply !== null,
      hasEdit: draft.edit !== null,
      onEditLast,
    });

  const align = grown ? 'self-end' : 'self-center';

  return (
    <form
      onSubmit={onSubmitForm} // pt-1.5 (7.5px @1.25): зазор метка «Просмотрено»→остров = 1.5× зазора
      // пузырь→метка (вердикт владельца раунда 4). Меньше нельзя: этот паддинг —
      // ЕДИНСТВЕННАЯ полоса под низом ленты (метка = нижняя граница прокрутки,
      // gotchas «Фронтенд»); больше — метка «висит» по вердикту владельца.
      className={cn('shrink-0 bg-chat-zone px-3 pt-1.5 pb-2', className)}
    >
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
          // Р.9–10: тулбар ПРОЯВЛЯЕТСЯ при сужении (composer-reveal) и
          // РАСТВОРЯЕТСЯ на старте расширения (composer-hide в фазе exit,
          // frozen) — счётчик не висит слева у расширяющейся области.
          <span
            className={cn(
              'flex w-full items-center gap-0.5',
              selPhase === 'exit' ? 'composer-hide' : 'composer-reveal',
            )}
          >
            <SelectionToolbar sel={toolbarSel} frozen={selPhase === 'exit'} />
          </span>
        ) : disabledPlaceholder !== null ? (
          // Гейт прав (р.8): заглушка живёт ВНУТРИ островка — морф селекта
          // (288px→100%) доезжает до неё той же анимацией; геометрия строки
          // изоморфна вводу (#130): min-h-8 px-1.5 py-1.5 text-sm.
          <span className="composer-reveal min-h-8 w-full px-1.5 py-1.5 text-sm text-muted-foreground">
            {disabledPlaceholder}
          </span>
        ) : (
          // Р.9: разворот полного контента после морфа — контент монтируется
          // прозрачным и проявляется (composer-reveal), а не вспыхивает
          // скачком на финальной ширине островка.
          <span className="composer-reveal flex w-full flex-col gap-1">
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
            {/* Трея вложений НЕТ (#144): прикреплённые файлы живёт в окне
                отправки (attach-send-dialog), строка ввода — только текст. */}
            {/* Превалидация лимита текста (раунд 3): счётчик у черты 4000,
                при превышении — понятное сообщение; отправка заблокирована,
                текст остаётся в поле/черновике (серверный 422 не наступает).
                Рядом — инлайн-ошибка 409 политики важных (#177). */}
            {limit.over ? (
              <span
                className="px-1.5 text-label-sm text-destructive"
                role="status"
                aria-live="polite"
              >
                {ui.chat.messageLimitHint}
              </span>
            ) : sendError ? (
              <span
                className="px-1.5 text-label-sm text-destructive"
                role="status"
                aria-live="polite"
              >
                {sendError.message}
              </span>
            ) : limit.counter !== null ? (
              <span className="px-1.5 text-right font-mono text-label-sm text-muted-foreground tabular-nums">
                {limit.counter}
              </span>
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
                  // Хост запретил вложения: скрепка на месте, но выключена.
                  aria-label={ui.chat.attachFile}
                  title={ui.chat.attachFile}
                  disabled
                >
                  <Paperclip strokeWidth={1.75} />
                </Button>
              )}
              {/* Фокус на входе в чат — ЧЕРЕЗ registerComposer (реф-колбэк
                  textarea): el.focus({preventScroll:true}). БЕЗ autoFocus-
                  атрибута (#132 р.11): НАТИВНЫЙ автофокус скроллит ВСЕХ
                  предков без preventScroll — при открытии окна трэда композер
                  монтируется за правым краем overflow-hidden рамки, браузер
                  сдвигал её контент на ~7px влево и обратно (jitter-лог
                  владельца: все дети рамки -7px, ширины на месте) — «весь
                  контент карточки дёргается». rows=1 + field-sizing: рост до
                  45vh, дальше скролл внутри поля (вердикт 15.09.2026).
                  @упоминания (#176/#228): в поле ВИДИМЫЙ текст (имена
                  без разметки), зеркальный оверлей композера рисует его
                  метрически 1:1 с подчёркиванием чипов. Каретка НАТИВНАЯ
                  (caret-foreground) — стоит там, где ввод; клики по
                  подчёркнутому имени открывают поповер правки. */}
              <span className="relative flex min-w-0 flex-1 flex-col">
                {mentions.open ? (
                  <MentionAutocompletePanel
                    candidates={mentions.autocomplete.candidates}
                    active={mentions.autocomplete.active}
                    onHover={mentions.autocomplete.setActive}
                    onPick={mentions.pick}
                  />
                ) : null}
                <MentionFieldOverlay
                  text={text}
                  mentions={draftMentions}
                  textareaRef={inputRef}
                  editToken={editToken}
                  onRename={(index, label) =>
                    useChatDrafts.getState().renameMention(focusId, index, label)
                  }
                  onRemove={(index) => useChatDrafts.getState().removeMention(focusId, index)}
                  onEditClose={() => {
                    setEditToken(null);
                    // Каретку DOM поповер поставил — забрать в state (иначе
                    // детектор автокомплита живёт по старой позиции).
                    const el = inputRef.current;
                    if (el) mentions.syncCaret(el);
                  }}
                />
                <Textarea
                  ref={registerInput}
                  value={text}
                  className="max-h-[45vh] min-h-8 flex-1 resize-none rounded-lg border-0 bg-transparent px-1.5 py-1.5 text-transparent caret-foreground shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
                  onFocus={() => {
                    const el = inputRef.current;
                    if (caretToEndRef.current && el) {
                      el.setSelectionRange(el.value.length, el.value.length);
                    }
                    caretToEndRef.current = false;
                  }}
                  onChange={(e) => {
                    setText(focusId, e.target.value);
                    mentions.syncCaret(e.target);
                    if (conversationId && e.target.value.length > 0) {
                      emitTyping(conversationId, typingThreadRootId);
                    }
                  }}
                  onKeyUp={(e) => mentions.syncCaret(e.currentTarget)}
                  onClick={(e) => {
                    // Кликом по пилюле (каретка попала в диапазон чипа)
                    // открываем поповер правки label (#228: каретка нативная,
                    // позиции честные — клампы не нужны).
                    const el = e.currentTarget;
                    const offset = el.selectionStart ?? 0;
                    const index = mentionIndexAtOffset(draftMentions, offset);
                    setEditToken(index === null ? null : { ...draftMentions[index]!, index });
                    mentions.syncCaret(el);
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  placeholder={placeholder}
                  rows={1}
                />
              </span>
              {/* Молния «Важное» (#177, ревизия 05.10 — тоггл с бейджем
                  зарядов): слева от смайликов; в правке, пересылке, селекте
                  и без права поста — выключена; в Заметках — скрыта. */}
              {urgentEnabled && disabledPlaceholder === null ? (
                <ComposerUrgentButton
                  draftKey={focusId}
                  align={align}
                  disabled={draft.edit !== null || pending !== null || selPhase !== 'normal'}
                />
              ) : null}
              {/* Медиа-пикер (#130 → #143): вкладки «Эмодзи | Стикеры»,
                  вставка эмодзи в каретку, стикер — мгновенная отправка;
                  попап не крадёт «вечный курсор». Стикеры недоступны в
                  режиме селекта/пересылки и без права поста. */}
              <MediaPickerButton
                onPickEmoji={insertEmoji}
                onPickSticker={pickSticker}
                stickersDisabled={
                  !stickersEnabled ||
                  selPhase !== 'normal' ||
                  disabledPlaceholder !== null ||
                  pending !== null
                }
              >
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
              </MediaPickerButton>
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
