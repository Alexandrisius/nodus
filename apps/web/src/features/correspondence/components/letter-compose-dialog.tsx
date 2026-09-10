import { Paperclip, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Textarea } from '@nodus/ui/components/textarea';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useCreateLetter } from '../api/letters-api.js';

interface DraftFile {
  name: string;
  size: number;
}

/**
 * Создание исходного письма (почтовый клиент): «Написать письмо» из журнала,
 * «Ответить» из карточки входящего (предзаполнение корреспондента и темы Re:).
 * Файлы выбираются с диска (в концепте — имена/размеры, загрузка — с бэкендом
 * хранилища). Отправка — POST /letters (createLetterBodySchema), созданное
 * письмо открывается карточкой в стеке (ADR-0009) и видно в «Исходящих».
 */
export function LetterComposeDialog({
  open,
  onOpenChange,
  defaultCorrespondent = '',
  defaultSubject = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCorrespondent?: string;
  defaultSubject?: string;
}) {
  const create = useCreateLetter();
  const openCard = useOpenCard();
  const [correspondent, setCorrespondent] = useState(defaultCorrespondent);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<DraftFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Предзаполнение при каждом открытии (ответ на другое письмо).
  useEffect(() => {
    if (open) {
      setCorrespondent(defaultCorrespondent);
      setSubject(defaultSubject);
      setBody('');
      setFiles([]);
    }
  }, [open, defaultCorrespondent, defaultSubject]);

  const valid = correspondent.trim().length > 0 && subject.trim().length > 0;

  function submit() {
    if (!valid || create.isPending) return;
    create.mutate(
      {
        correspondent: correspondent.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachments: files,
      },
      {
        onSuccess: (letter) => {
          onOpenChange(false);
          openCard({ kind: 'letter', id: letter.id });
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogTitle className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {ui.letters.composeTitle}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {ui.letters.recipient}
            </span>
            <Input
              autoFocus
              value={correspondent}
              onChange={(e) => setCorrespondent(e.target.value)}
              placeholder="ООО «Заказчик»"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {ui.letters.composeSubject}
            </span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {ui.letters.composeBody}
            </span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="resize-none"
            />
          </label>

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip data-icon="inline-start" />
              {ui.letters.composeAttachments}
            </Button>
            {files.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                  >
                    <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                      {Math.round(file.size / 1024)} {ui.letters.kb}
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
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
          <NodeLabel label={ui.letters.typeOutgoing} />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {ui.common.cancel}
            </Button>
            <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
              <Send data-icon="inline-start" />
              {ui.letters.send}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
