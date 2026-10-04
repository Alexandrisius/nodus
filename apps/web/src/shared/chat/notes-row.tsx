import type { ReactNode } from 'react';
import type { ChatMessage, FavoriteCard } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { MessageScrollerItem } from '@nodus/ui/components/message-scroller';

import { favoriteSourceTitle } from './favorite-message.js';
import { FavoriteLabelChips, FavoriteLabels } from './favorite-labels.js';
import { FavoriteMenu } from './favorite-menu.js';
import { ChatMessageItem } from './chat-message.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';

/** Одна строка потока «Избранного» (notes-pane, #171/#215): запись или
 *  карточка. Личные тэги — ЕДИНЫЙ слой реакций (публичного пикера в витрине
 *  нет): карточка берёт тэги из себя, запись — из своей тэг-строки-закладки
 *  (cardsById витрины). Мета «просмотрено/ознакомились» выключена для ВСЕХ
 *  строк витрины (receiptsHidden, #215). */
export function FavoriteRunMessage({
  message,
  card,
  labelTarget,
  mine,
  showName,
  tail,
  style,
  conversationId,
  scope,
  selectionActive,
  selectedSet,
  onToggle,
}: {
  message: ChatMessage;
  /** Карточка (строка — псевдо-сообщение оригинала) или null (запись). */
  card: FavoriteCard | null;
  /** Тэг-цель строки: карточка/тэг-строка записи/пустышка записи (апсерт). */
  labelTarget: { messageId: string; labels: string[] };
  mine: boolean;
  showName: boolean;
  tail: boolean;
  style?: React.CSSProperties;
  conversationId: string;
  scope: string;
  selectionActive: boolean;
  selectedSet: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
}) {
  // В режиме селекта выбираемы ВСЕ живые строки (#215): записи и карточки —
  // пакетное удаление маршрутизируется по типу (запись — удалить, карточку —
  // снять звезду, splitNotesSelection в delete-dialog).
  const selectable = selectionActive && !message.deletedAt;
  const labels = labelTarget.labels;
  const labelSlots: { reactionsRow?: ReactNode; reactionPicker?: (atEnd: boolean) => ReactNode } =
    message.deletedAt || selectionActive
      ? {}
      : {
          reactionsRow:
            labels.length > 0 ? (
              <FavoriteLabelChips
                labels={labels}
                messageId={labelTarget.messageId}
                onFilled={mine}
              />
            ) : undefined,
          reactionPicker: (atEnd: boolean) => (
            <FavoriteLabels labels={labels} messageId={labelTarget.messageId} atEnd={atEnd} />
          ),
        };
  const row =
    card === null ? (
      <MessageMenu
        message={message}
        mine={mine}
        conversationId={conversationId}
        scope={scope}
        hideFavorite
      >
        <ChatMessageItem
          message={message}
          mine={mine}
          showName={showName}
          avatarSlot="none"
          tail={tail}
          reactionsHidden={selectionActive}
          receiptsHidden
          {...labelSlots}
        />
      </MessageMenu>
    ) : (
      <FavoriteMenu card={card}>
        <ChatMessageItem
          message={message}
          mine={mine}
          showName={showName}
          avatarSlot="none"
          tail={tail}
          nameSuffix={<SourceSuffix card={card} />}
          receiptsHidden
          {...labelSlots}
        />
      </FavoriteMenu>
    );
  return (
    <MessageScrollerItem messageId={message.id} style={style}>
      <MessageRow
        messageId={message.id}
        selectable={selectable}
        selected={selectedSet.has(message.id)}
        onToggle={(shift) => onToggle(message.id, shift)}
      >
        {row}
      </MessageRow>
    </MessageScrollerItem>
  );
}

/** Подпись источника карточки рядом с именем автора: «из <чат>». */
function SourceSuffix({ card }: { card: FavoriteCard }) {
  const title = favoriteSourceTitle(card);
  if (!title) return null;
  return (
    <span className="ml-1 truncate text-xs font-normal text-muted-foreground">
      {ui.chat.favoriteFrom} «{title}»
    </span>
  );
}
