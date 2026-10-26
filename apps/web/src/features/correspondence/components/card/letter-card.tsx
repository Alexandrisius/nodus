import { useRef, useState } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { useRailShrink } from '../../../../app/shell/right-rail.js';
import { useCloseCard } from '../../../../app/shell/use-card-stack.js';
import { ApiError } from '../../../../shared/api-client.js';
import { useReadEntityNotifications } from '../../../../shared/api/read-entity-notifications.js';
import { uiPx } from '../../../../shared/ui/ui-scale.js';
import { MIN_CHAT_W, useChatWidth } from '../../../../shared/ui/use-chat-width.js';
import { useDeleteSpamLetter, useJoinLetter } from '../../api/letters-mutations.js';
import { useLetterDetail } from '../../api/letters-queries.js';
import {
  activateTab,
  closeFileTab,
  fileIdOf,
  initialTabs,
  openFileTab,
  pruneFileTabs,
  type LetterTabId,
  type LetterTabsState,
} from '../../lib/letter-tabs.js';
import { SpamConfirmDialog } from '../pipeline/spam-confirm-dialog.js';
import { LetterActionBar } from './letter-action-bar.js';
import { LetterAttributes } from './letter-attributes.js';
import { LetterCardChainBar } from './letter-card-chain-bar.js';
import { LetterCardSkeleton } from './letter-card-skeleton.js';
import { LetterFieldsBoard } from './letter-fields-board.js';
import { LetterFilesBlock } from './letter-files-block.js';
import { LetterHistory } from './letter-history.js';
import { LetterSideTabs } from './letter-side-tabs.js';
// Побочный эффект: превью ссылок на письма в чате (link-previews); карточка —
// eager-импорт стека, поэтому реестр заполнен на старте.
import '../letter-link-preview.js';

/** Левая зона не уже этого: дальше сужается правая панель до своего пола. */
const MIN_MAIN_W = uiPx(320);

/** Стартовая вкладка: «Тело»; у письма без текста и документа участнику —
 *  сразу «Чат». */
function defaultTabOf(letter: LetterDetail): LetterTabId {
  return letter.body.kind === 'none' && letter.access.isParticipant ? 'chat' : 'body';
}

/**
 * Карточка письма (#55, U7; стек ADR-0009, `?cards=letter:<id>`) — анатомия
 * карточки задачи: полоса цепочки «ПИСЬМО · Вх-…» со статусом; слева —
 * доска регистрационных данных (правка у канцелярии), атрибуты типа,
 * «Файлы», «История» (свёрнута) и замоноличенный бар h-16 с кнопками
 * маршрута и «Присоединиться к обсуждению»; справа — панель вкладок «Тело» /
 * «Чат» / вложения по канону «чат — буфер сужений»: рельса сужает её до
 * пола, дальше — левую зону; перегородка тянется с общей памятью ширины.
 * Тема — в хроме слайдера (`LetterTitle`), в теле не дублируется.
 */
export function LetterCard({ letterId }: { letterId: string }) {
  const { data: letter, isLoading, error } = useLetterDetail(letterId);
  // Открыл письмо — его уведомления прочитаны (как у задачи, #252).
  useReadEntityNotifications('letter', letterId);
  const join = useJoinLetter(letterId);
  const deleteSpam = useDeleteSpamLetter();
  const closeCard = useCloseCard();
  const [spamOpen, setSpamOpen] = useState(false);
  // Вкладки — до первого действия производные от письма (стартовая вкладка).
  const [tabsState, setTabsState] = useState<LetterTabsState | null>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const railShrink = useRailShrink();
  const { chatW, onDividerDown, dragging } = useChatWidth(sideRef, railShrink, MIN_CHAT_W);
  const sideW = Math.max(chatW - railShrink, MIN_CHAT_W);

  if (!letter && error instanceof ApiError && error.status === 404) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {ui.letters.card.notFound}
      </div>
    );
  }
  if (isLoading || !letter) return <LetterCardSkeleton sideW={sideW} />;

  const attachmentIds = letter.attachments.map((file) => file.id);
  const tabs = pruneFileTabs(tabsState ?? initialTabs(defaultTabOf(letter)), attachmentIds);
  const updateTabs = (change: (state: LetterTabsState) => LetterTabsState) =>
    setTabsState((state) =>
      change(pruneFileTabs(state ?? initialTabs(defaultTabOf(letter)), attachmentIds)),
    );
  const bodyAttachmentId = letter.body.kind === 'none' ? null : letter.body.attachmentId;
  // Подсветка плитки: файл активной вкладки, у «Тела» — его документ.
  const activeFileId = fileIdOf(tabs.active) ?? (tabs.active === 'body' ? bodyAttachmentId : null);

  /** Файл из блока «Файлы»: тело письма — вкладка «Тело», остальное — своя. */
  const openAttachment = (attachmentId: string) =>
    updateTabs((state) =>
      attachmentId === bodyAttachmentId
        ? activateTab(state, 'body')
        : openFileTab(state, attachmentId),
    );
  const onJoin = () =>
    join.mutate(undefined, { onSuccess: () => updateTabs((state) => activateTab(state, 'chat')) });

  return (
    <div className="flex h-full min-w-0 flex-col">
      <LetterCardChainBar letter={letter} />
      <div className="relative flex min-h-0 flex-1">
        {/* Левая зона: скроллится только контент, бар h-16 замоноличен (его
            верхняя линия — одна горизонталь с композером чата). border-r —
            структурная граница с панелью; ручка — оверлей поверх неё.
            @container — сетка полей и бар перестраиваются от ширины зоны. */}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border-r border-border @container"
          style={{ minWidth: MIN_MAIN_W }}
        >
          <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl pb-4">
              <LetterFieldsBoard letter={letter} />
              <LetterAttributes letter={letter} />
              <LetterFilesBlock letter={letter} activeId={activeFileId} onOpen={openAttachment} />
              <LetterHistory letterId={letter.id} />
            </div>
          </div>
          <div className="flex h-16 shrink-0 items-center border-t border-border px-5">
            <LetterActionBar
              letter={letter}
              joining={join.isPending}
              onJoin={onJoin}
              onDeleteSpam={() => setSpamOpen(true)}
            />
          </div>
          <div
            onPointerDown={onDividerDown}
            role="separator"
            aria-orientation="vertical"
            aria-label={ui.common.resizePanel}
            title={ui.common.resizePanel}
            className="group absolute top-0 right-0 z-10 h-full w-3 translate-x-1/2 cursor-col-resize"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-port/60 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>

        {/* Панель вкладок — буфер сужений: transition только для программных
            сужений (рельса), во время drag снят — ширина идёт императивно. */}
        <div
          ref={sideRef}
          className={cn(
            'min-h-0 overflow-hidden',
            !dragging && 'transition-[width] duration-200 ease-out',
          )}
          style={{ width: sideW, minWidth: MIN_CHAT_W, flexShrink: 1 }}
        >
          <LetterSideTabs
            letter={letter}
            tabs={tabs}
            joining={join.isPending}
            onActivate={(tab) => updateTabs((state) => activateTab(state, tab))}
            onClose={(attachmentId) => updateTabs((state) => closeFileTab(state, attachmentId))}
            onJoin={onJoin}
          />
        </div>
      </div>

      <SpamConfirmDialog
        open={spamOpen}
        onCancel={() => setSpamOpen(false)}
        onConfirm={() => {
          // Удаление оптимистично (Р12): карточка закрывается сразу, строка
          // уходит из «Новых»; отказ сервера вернёт строку и покажет тост.
          setSpamOpen(false);
          closeCard();
          deleteSpam.mutate(letter.id);
        }}
      />
    </div>
  );
}
