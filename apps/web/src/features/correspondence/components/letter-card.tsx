import { FileText, SendHorizonal } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Separator } from '@nodus/ui/components/separator';
import { Skeleton } from '@nodus/ui/components/skeleton';
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
import { useIssueResolution, useLetterDetail } from '../api/letters-api.js';
import { LetterStatusBadge } from './letter-status-badge.js';

/** Карточка письма: реквизиты, тело, вложения, резолюции → «В поручение» (поток А). */
export function LetterCard({ letterId }: { letterId: string }) {
  const { data: letter, isLoading } = useLetterDetail(letterId);
  const issueResolution = useIssueResolution(letterId);
  const [text, setText] = useState('');
  const navigate = useNavigate();

  if (isLoading || !letter) {
    return <Skeleton className="h-full w-full" />;
  }

  function issue() {
    const trimmed = text.trim();
    if (!trimmed) return;
    issueResolution.mutate(trimmed, {
      onSuccess: (resolution) => {
        setText('');
        if (resolution.taskId) {
          void navigate({ to: '/tasks/$taskId', params: { taskId: resolution.taskId } });
        }
      },
    });
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-2">
        <LetterStatusBadge status={letter.status} />
        {letter.regNumber && (
          <span className="text-sm font-medium text-muted-foreground">
            {ui.letters.regNumber} {letter.regNumber}
          </span>
        )}
      </div>

      <h2 className="mt-3 text-xl font-semibold">{letter.subject}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {ui.letters.correspondent}: {letter.correspondent} · {formatDateTime(letter.receivedAt)}
      </p>

      <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap">{letter.body}</p>

      {letter.attachments.length > 0 && (
        <>
          <Separator className="my-4" />
          <h3 className="text-sm font-semibold">{ui.letters.attachments}</h3>
          <AttachmentGroup className="mt-2 flex-wrap">
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
      )}

      <Separator className="my-4" />
      <h3 className="text-sm font-semibold">{ui.letters.resolutions}</h3>
      <div className="mt-2 flex flex-col gap-3">
        {letter.resolutions.length === 0 && (
          <p className="text-sm text-muted-foreground">{ui.common.empty}</p>
        )}
        {letter.resolutions.map((resolution) => (
          <div key={resolution.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <PersonAvatar name={resolution.author.displayName} className="size-6" />
              <span className="font-medium">{resolution.author.displayName}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(resolution.createdAt)}
              </span>
            </div>
            <p className="mt-1.5 text-sm whitespace-pre-wrap">{resolution.text}</p>
            {resolution.taskId && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0"
                onClick={() =>
                  void navigate({
                    to: '/tasks/$taskId',
                    params: { taskId: resolution.taskId ?? '' },
                  })
                }
              >
                {ui.tasks.instruction} →
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2 rounded-xl border bg-card p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={ui.letters.resolutionPlaceholder}
          rows={2}
          className="min-h-9 flex-1 resize-none"
        />
        <Button onClick={issue} disabled={!text.trim() || issueResolution.isPending}>
          <SendHorizonal data-icon="inline-start" />
          {ui.letters.toInstruction}
        </Button>
      </div>
    </div>
  );
}
