import { FileText, Reply } from 'lucide-react';
import { useRef, useState } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';
import { cn } from '@nodus/ui/lib/utils';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useRailShrink } from '../../../app/shell/right-rail.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { formatBytes } from '../../../shared/lib/format.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { MIN_CHAT_W, useChatWidth } from '../../../shared/ui/use-chat-width.js';
import { useLetterDetail, useLetterReplyTarget } from '../api/letters-api.js';
import { ChannelChip } from './channel-chip.js';
import { LetterBottomBar } from './letter-bottom-bar.js';
import { LetterCardSkeleton } from './letter-card-skeleton.js';
import { LetterComposeDialog } from './letter-compose-dialog.js';
import { LetterHeader } from './letter-header.js';
import { LetterRequisites } from './letter-requisites.js';
import { LetterResolutions } from './letter-resolutions.js';
import { RegistrationDialog } from './registration-dialog.js';
import { ResolutionComposer } from './resolution-composer.js';
import { LetterTypeIcon } from '../lib/letter-fields.js';
// Побочный эффект: регистрация превью ссылок на письма в чате (link-previews);
// карточка письма — eager-импорт стека, поэтому реестр заполнен на старте.
import './letter-link-preview.js';

/**
 * Карточка письма — ЕДИНЫЙ шаблон сущности (вердикт владельца 22.09.2026,
 * образец: task-card): полоса цепочки (само-узел «ПИСЬМО/ДОКУМЕНТ · рег.№»,
 * связь «ответ на», канал, направление, «Ответить») → почтовая шапка → тело
 * читательской колонкой → вложения → реквизиты (EntityFields) → [у документа]
 * резолюции с поручениями-задачами; справа — чат письма (гармошка как у задач,
 * единый механизм обсуждений ConversationPane; участники — только внутренние).
 * Геометрия чата — канон «чат — буфер сужений» (issue #63): рельса сужает
 * колонку обсуждения до MIN_CHAT_W, дальше двигается левая зона.
 */
export function LetterCard({ letterId }: { letterId: string }) {
  const { data: letter, isLoading } = useLetterDetail(letterId);
  const { data: replyTarget } = useLetterReplyTarget(letter?.inReplyToId);
  const openCard = useOpenCard();
  const [registerFor, setRegisterFor] = useState<LetterDetail | null>(null);
  const [resolutionFor, setResolutionFor] = useState<LetterDetail | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const railShrink = useRailShrink();
  const { chatW, onDividerDown, dragging } = useChatWidth(chatRef, railShrink, MIN_CHAT_W);
  const chatColumnW = Math.max(chatW - railShrink, MIN_CHAT_W);

  if (isLoading || !letter) {
    return <LetterCardSkeleton chatW={chatColumnW} />;
  }

  // Цепочка: [исходник «ответ на» →] само-узел «ПИСЬМО/ДОКУМЕНТ · рег.№».
  const chainNodes: ChainNode[] = [];
  if (replyTarget) {
    chainNodes.push({
      caption: ui.letters.letter,
      ref: replyTarget.registration?.regNumber ?? ui.letters.noNumber,
      label: replyTarget.subject,
      onClick: () => openCard({ kind: 'letter', id: replyTarget.id }),
    });
  }
  chainNodes.push({
    caption: letter.registration ? ui.letters.document : ui.letters.letter,
    ref: letter.registration?.regNumber ?? ui.letters.noNumber,
    active: true,
  });

  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Полоса цепочки: бордюр — структура, контент — fade; действия
            письма («Ответить») — справа, как у почтовых клиентов */}
        <div className="shrink-0 border-b border-border">
          <div className="content-fade flex h-14 items-center gap-3 px-5">
            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
              <DomainChain nodes={chainNodes} />
            </div>
            <ChannelChip channel={letter.receiveChannel} />
            <NodeChip tone="muted" className="shrink-0">
              <LetterTypeIcon letter={letter} />
              {letter.type === 'incoming' ? ui.letters.typeIncoming : ui.letters.typeOutgoing}
            </NodeChip>
            {letter.type === 'incoming' ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setReplyOpen(true)}
              >
                <Reply data-icon="inline-start" />
                {ui.letters.reply}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Треки БЕЗ transition при drag (канон #63/#65): ширина чата идёт
          императивно, transition — только программные сужения (рельса). */}
        <div
          className="relative grid min-h-0 flex-1"
          style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}
        >
          {/* Левая зона: скроллится только контент; нижний бар h-16
            замоноличен (высота = композеру чата — одна горизонталь). */}
          <div className="relative flex min-h-0 flex-col border-r border-border @container">
            <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
              <LetterHeader letter={letter} />

              {/* Тело письма — читательская колонка */}
              <p className="mt-5 max-w-3xl text-body-lg leading-relaxed whitespace-pre-wrap text-foreground/90">
                {letter.body}
              </p>

              {letter.attachments.length > 0 ? (
                <>
                  <div className="mt-6">
                    <NodeLabel label={ui.letters.attachments} count={letter.attachments.length} />
                  </div>
                  <AttachmentGroup className="mt-2.5 flex-wrap">
                    {letter.attachments.map((file) => (
                      <Attachment key={file.id}>
                        <AttachmentMedia>
                          <FileText />
                        </AttachmentMedia>
                        <AttachmentContent>
                          <AttachmentTitle>{file.name}</AttachmentTitle>
                          <AttachmentDescription>{formatBytes(file.size)}</AttachmentDescription>
                        </AttachmentContent>
                      </Attachment>
                    ))}
                  </AttachmentGroup>
                </>
              ) : null}

              {/* Секции разделяются отступами, без висячих сепараторов (канон) */}
              <div className="mt-8">
                <NodeLabel label={ui.letters.requisites} />
              </div>
              <div className="mt-2.5">
                <LetterRequisites letter={letter} />
              </div>

              {/* Резолюции — только у документа (у письма их не бывает) */}
              {letter.registration ? <LetterResolutions letter={letter} /> : null}
            </div>

            <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
              <LetterBottomBar
                letter={letter}
                onRegister={() => setRegisterFor(letter)}
                onResolution={() => setResolutionFor(letter)}
              />
            </div>

            {/* Ручка ресайза чата: оверлей поверх структурной границы */}
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

          {/* Чат письма — единый механизм обсуждений (ConversationPane):
            те же серии/дни/треды, что в мессенджере; участники — только
            внутренние сотрудники, обсуждение наружу не уходит. */}
          <div
            ref={chatRef}
            className={cn(
              'min-h-0 overflow-hidden',
              !dragging && 'transition-[width] duration-200 ease-out',
            )}
            style={{ width: chatColumnW }}
          >
            <div className="h-full w-full bg-background">
              <div className="content-fade h-full">
                <ConversationPane
                  conversationId={letter.conversationId}
                  emptyLabel={ui.letters.discussionEmpty}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <RegistrationDialog
        letter={registerFor}
        onOpenChange={(open) => {
          if (!open) setRegisterFor(null);
        }}
      />
      <ResolutionComposer
        letter={resolutionFor}
        onOpenChange={(open) => {
          if (!open) setResolutionFor(null);
        }}
      />
      <LetterComposeDialog open={replyOpen} onOpenChange={setReplyOpen} replyTo={letter} />
    </div>
  );
}
