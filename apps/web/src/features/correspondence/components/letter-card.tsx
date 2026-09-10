import { ArrowRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
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

import { formatDateTime } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';
import { useIssueResolution, useLetterDetail, useRegisterLetter } from '../api/letters-api.js';
import { LetterFields } from './letter-fields.js';
import { LetterCardSkeleton } from './letter-card-skeleton.js';
import { LetterTypeIcon } from '../lib/letter-fields.js';

/**
 * Карточка письма (поток А): документ — одна зона (тело → поля-реестр →
 * вложения → резолюции), контент max-w-4xl по центру; в хроме слайдера —
 * название (title), в полосе цепочки — само-узел «ПИСЬМО · рег.№» и чип
 * направления. Замоноличенный нижний бар h-16 (модель Битрикса): слева
 * «Зарегистрировать» (очередь), справа — композер резолюции «В поручение»
 * (пессимистичная мутация: юридически значимое действие).
 */
export function LetterCard({ letterId }: { letterId: string }) {
  const { data: letter, isLoading } = useLetterDetail(letterId);
  const issueResolution = useIssueResolution(letterId);
  const register = useRegisterLetter();
  const [text, setText] = useState('');
  const navigate = useNavigate();

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
          void navigate({ to: '/tasks/$taskId', params: { taskId: resolution.taskId } });
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
      {/* Полоса цепочки: бордюр — структура, контент — fade */}
      <div className="shrink-0 border-b border-border">
        <div className="content-fade flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <DomainChain nodes={chainNodes} />
          </div>
          <NodeChip tone="muted" className="shrink-0">
            <LetterTypeIcon letter={letter} />
            {letter.type === 'incoming' ? ui.letters.typeIncoming : ui.letters.typeOutgoing}
          </NodeChip>
        </div>
      </div>

      <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {letter.body}
          </p>

          <LetterFields letter={letter} />

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
                      <AttachmentDescription>
                        {Math.round(file.size / 1024)} {ui.letters.kb}
                      </AttachmentDescription>
                    </AttachmentContent>
                  </Attachment>
                ))}
              </AttachmentGroup>
            </>
          ) : null}

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
                    onClick={() =>
                      void navigate({
                        to: '/tasks/$taskId',
                        params: { taskId: resolution.taskId ?? '' },
                      })
                    }
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
    </div>
  );
}
