import { Paperclip, Send, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { CounterpartyRef, LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Textarea } from '@nodus/ui/components/textarea';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { formatBytes } from '../../../shared/lib/format.js';
import { useProjectsList } from '../../../shared/api/projects-list.js';
import { CounterpartyCombobox } from '../../../shared/counterparties/counterparty-combobox.js';
import { FilterCombobox } from '../../../shared/views/filter-combobox.js';
import { useCreateLetter, useMailboxes } from '../api/letters-api.js';

interface DraftFile {
  name: string;
  size: number;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Композер исходящего (модель v2, вердикты 22.09.2026): «От кого» (ящик),
 *  контрагент из справочника (не строка), проект, переключатель «просто
 *  письмо / документ с Исх-№» (документ регистрируется при отправке — номер
 *  присваивает сервер), канал (почта/бумага), ФАЙЛЫ ВПЕРЁД текста (сценарий
 *  секретаря «бумага на столе → скан → отправка»), сопроводительный текст —
 *  опционален. «Ответить» из карточки — префил контрагента/темы и связь
 *  «ответ на» (пересылка запрещена концептуально). */
export function LetterComposeDialog({
  open,
  onOpenChange,
  replyTo = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo?: LetterDetail | null;
}) {
  const create = useCreateLetter();
  const openCard = useOpenCard();
  const { data: mailboxes } = useMailboxes();
  const { data: projects } = useProjectsList();
  const mailbox = mailboxes?.[0] ?? null;

  const [counterparty, setCounterparty] = useState<CounterpartyRef | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [asDocument, setAsDocument] = useState(false);
  const [channel, setChannel] = useState<'email' | 'paper'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<DraftFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Предзаполнение при каждом открытии — ответ на другое письмо
  // (рендер-тайм сброс по переходу open, канон React, аудит #45).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setCounterparty(replyTo?.counterparty ?? null);
      setProjectId(replyTo?.registration?.project?.id);
      setAsDocument(false);
      setChannel('email');
      setSubject(replyTo ? `${ui.letters.replySubjectPrefix}${replyTo.subject}` : '');
      setBody('');
      setFiles([]);
    }
  }

  const valid =
    counterparty !== null &&
    mailbox !== null &&
    subject.trim().length > 0 &&
    (body.trim().length > 0 || files.length > 0);

  function submit() {
    if (!valid || !counterparty || !mailbox || create.isPending) return;
    create.mutate(
      {
        body: {
          mailboxId: mailbox.id,
          counterpartyId: counterparty.id,
          projectId: projectId ?? null,
          receiveChannel: channel,
          asDocument,
          subject: subject.trim(),
          body: body.trim(),
          attachments: files,
          inReplyToId: replyTo?.id ?? null,
        },
        counterpartyName: counterparty.name,
        mailbox,
      },
      {
        onSuccess: (letter) => {
          onOpenChange(false);
          openCard({ kind: 'letter', id: letter.id });
        },
      },
    );
  }

  const projectOptions = (projects?.items ?? []).map((p) => ({
    value: p.id,
    label: `${p.code} · ${p.name}`,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl bg-card">
        <DialogTitle className="text-base font-semibold text-foreground">
          {replyTo ? `${ui.letters.reply}: ${replyTo.subject}` : ui.letters.composeTitle}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.letters.composeFrom}>
              <div className="flex h-8 items-center truncate rounded-md border border-border bg-muted/40 px-2.5 font-mono text-label-sm text-muted-foreground">
                {mailbox?.address ?? ui.common.notSet}
              </div>
            </Field>
            <Field label={ui.letters.composeTo}>
              <CounterpartyCombobox
                value={counterparty}
                onChange={setCounterparty}
                ariaLabel={ui.letters.composeTo}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={ui.letters.project}>
              <FilterCombobox
                options={projectOptions}
                value={projectId}
                onChange={setProjectId}
                ariaLabel={ui.letters.project}
                placeholder={ui.tasks.noProject}
              />
            </Field>
            {/* Вид отправления и канал — чипы-переключатели */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {ui.letters.composeKind}
              </span>
              <div className="flex h-8 items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={!asDocument}
                  onClick={() => setAsDocument(false)}
                  className="rounded transition-opacity hover:opacity-80"
                >
                  <NodeChip tone={!asDocument ? 'info' : 'muted'}>
                    {ui.letters.composeKindLetter}
                  </NodeChip>
                </button>
                <button
                  type="button"
                  aria-pressed={asDocument}
                  onClick={() => setAsDocument(true)}
                  className="rounded transition-opacity hover:opacity-80"
                >
                  <NodeChip tone={asDocument ? 'info' : 'muted'}>
                    {ui.letters.composeKindDocument}
                  </NodeChip>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {ui.letters.channel}
            </span>
            <div className="flex gap-1.5">
              {(['email', 'paper'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={channel === c}
                  onClick={() => setChannel(c)}
                  className="rounded transition-opacity hover:opacity-80"
                >
                  <NodeChip tone={channel === c ? 'info' : 'muted'}>
                    {ui.letters.channels[c]}
                  </NodeChip>
                </button>
              ))}
            </div>
            {asDocument ? (
              <span className="min-w-0 truncate font-mono text-label-sm text-muted-foreground">
                {ui.letters.composeRegHint}
              </span>
            ) : null}
          </div>

          {/* Файлы — ПЕРВЫМ блоком (сценарий «скан → отправка») */}
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []).map((f) => ({
                  name: f.name,
                  size: f.size,
                }));
                setFiles((prev) => [...prev, ...chosen]);
                e.target.value = '';
              }}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip data-icon="inline-start" />
                {ui.letters.composeAttachments}
              </Button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {ui.letters.composeAttachmentsHint}
              </span>
            </div>
            {files.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                      {formatBytes(file.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={ui.common.close}
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <Field label={ui.letters.composeSubject}>
            <Input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label={ui.letters.composeBody}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={ui.letters.composeBodyHint}
              className="resize-none"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {ui.common.cancel}
          </Button>
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            <Send data-icon="inline-start" />
            {ui.letters.send}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
