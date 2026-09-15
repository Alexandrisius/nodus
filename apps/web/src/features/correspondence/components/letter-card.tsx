import { ArrowRight, Building2, FileText, Reply } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Textarea } from '@nodus/ui/components/textarea';
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nodus/ui/components/attachment';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { formatBytes, formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useIssueResolution, useLetterDetail, useRegisterLetter } from '../api/letters-api.js';
import { LetterRequisites } from './letter-requisites.js';
import { LetterCardSkeleton } from './letter-card-skeleton.js';
import { LetterComposeDialog } from './letter-compose-dialog.js';
import { LetterStatusBadge } from './letter-status-badge.js';
import { LetterTypeIcon } from '../lib/letter-fields.js';

/**
 * Карточка письма — почтовый клиент (вердикт владельца 2026-09-10, раунд 2):
 * реальные письма с длинным текстом и пачкой приложений читаются удобно.
 * Почтовая шапка (корреспондент-организация — квадратом с иконкой, кому,
 * дата) → тело читательской колонкой max-w-3xl → вложения → реквизиты
 * регистрации (поля-реестр EntityFields) → резолюции. «Ответить» — в полосе
 * цепочки (входящие): композер исходящего с предзаполнением. Нижний бар h-16
 * (модель Битрикса): «Зарегистрировать» (очередь) + композер резолюции
 * «В поручение» (пессимистичная мутация — юридически значимое действие).
 */
export function LetterCard({ letterId }: { letterId: string }) {
  const { data: letter, isLoading } = useLetterDetail(letterId);
  const issueResolution = useIssueResolution(letterId);
  const register = useRegisterLetter();
  const [text, setText] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const openCard = useOpenCard();

  if (isLoading || !letter) {
    return <LetterCardSkeleton />;
  }

  function issue() {
    const trimmed = text.trim();
    if (!trimmed || issueResolution.isPending) return;
    issueResolution.mutate(trimmed, {
      onSuccess: (resolution) => {
        setText('');
        if (resolution.taskId) {
          openCard({ kind: 'task', id: resolution.taskId });
        }
      },
    });
  }

  // Само-узел — только «ТИП · №» (название один раз, в хроме слайдера).
  const chainNodes: ChainNode[] = [
    {
      caption: ui.letters.letter,
      ref: letter.regNumber ?? ui.letters.noNumber,
      active: true,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Полоса цепочки: бордюр — структура, контент — fade; действия письма
          («Ответить») — справа, как у почтовых клиентов */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
            <DomainChain nodes={chainNodes} />
          </div>
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

      <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6 @container">
        <div className="mx-auto w-full max-w-4xl">
          {/* Почтовая шапка: от кого / кому / когда (модель почтового клиента) */}
          <div className="flex items-center gap-3">
            <span className="node-panel flex size-10 shrink-0 items-center justify-center">
              <Building2 className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {letter.correspondent}
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                {letter.addressee ? (
                  <>
                    <PersonAvatar name={letter.addressee.displayName} className="size-4" />
                    <span className="truncate">
                      {letter.type === 'incoming' ? ui.letters.recipient : ui.letters.from}:{' '}
                      {letter.addressee.displayName}
                    </span>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                  </>
                ) : null}
                <span className="shrink-0 tabular-nums">{formatDateTime(letter.receivedAt)}</span>
              </div>
            </div>
            <LetterStatusBadge status={letter.status} />
          </div>

          {/* Тело письма — читательская колонка */}
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/90">
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

          {/* Реквизиты регистрации — поля-реестр (корреспондент/адресат/дата —
              в почтовой шапке выше, без дублирования) */}
          <div className="mt-8">
            <NodeLabel label={ui.letters.requisites} />
          </div>
          <div className="mt-2.5">
            <LetterRequisites letter={letter} />
          </div>

          {/* Секции разделяются отступами, без висячих сепараторов (канон) */}
          <div className="mt-6">
            <NodeLabel label={ui.letters.resolutions} count={letter.resolutions.length} />
          </div>
          <div className="mt-2.5 flex flex-col gap-2.5">
            {letter.resolutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
            ) : null}
            {letter.resolutions.map((resolution) => (
              <div key={resolution.id} className="node-panel p-3">
                <div className="flex items-center gap-2 text-sm">
                  <PersonAvatar name={resolution.author.displayName} className="size-6" />
                  <span className="font-medium">{resolution.author.displayName}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatDateTime(resolution.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm whitespace-pre-wrap">{resolution.text}</p>
                {resolution.taskId ? (
                  <button
                    type="button"
                    onClick={() => openCard({ kind: 'task', id: resolution.taskId ?? '' })}
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] text-info uppercase hover:underline"
                  >
                    {ui.tasks.instruction}
                    <ArrowRight className="size-3" strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Замоноличенный нижний бар h-16: регистрация + композер резолюции */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
        {letter.status === 'unregistered' ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={register.isPending}
            onClick={() => register.mutate(letter.id)}
          >
            {ui.letters.register}
          </Button>
        ) : null}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ui.letters.resolutionPlaceholder}
          rows={2}
          className="max-h-14 min-h-9 flex-1 resize-none"
        />
        <Button
          size="sm"
          className="shrink-0"
          disabled={!text.trim() || issueResolution.isPending}
          onClick={issue}
        >
          {ui.letters.toInstruction}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>

      <LetterComposeDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        defaultCorrespondent={letter.correspondent}
        defaultSubject={`Re: ${letter.subject}`}
      />
    </div>
  );
}
