import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { NodeLabel } from '@nodus/ui/components/node-label';
import { Textarea } from '@nodus/ui/components/textarea';

import { useUsersList } from '../../../shared/api/users-list.js';
import { localDateStr } from '../../../shared/ui/date-time-grid.js';
import { DateTimePicker } from '../../../shared/ui/date-time-picker.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';
import { FilterCombobox } from '../../../shared/views/filter-combobox.js';
import { useIssueResolution } from '../api/letters-api.js';

interface InstructionLine {
  key: number;
  text: string;
  assigneeId: string | undefined;
  deadline: Date | null;
}

let lineSeq = 0;

/**
 * Композер резолюции (модель v2): текст резолюции + строки поручений
 * (что сделать / исполнитель / срок). Поручение = задача (отдельной
 * сущности нет): сервер создаёт задачи source 'letter' с цепочкой
 * Письмо → Резолюция → Поручение → Задача. Резолюция без поручения
 * допустима («для сведения»). Мутация пессимистична — юридически значимая.
 */
export function ResolutionComposer({
  letter,
  onOpenChange,
}: {
  letter: LetterDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = letter !== null;
  const issue = useIssueResolution(letter?.id ?? '');
  const { data: users } = useUsersList();
  const [text, setText] = useState('');
  const [lines, setLines] = useState<InstructionLine[]>([]);

  // Сброс черновика при каждом открытии (рендер-тайм по переходу id, #45).
  const [prevLetterId, setPrevLetterId] = useState<string | null>(null);
  if ((letter?.id ?? null) !== prevLetterId) {
    setPrevLetterId(letter?.id ?? null);
    if (letter) {
      setText('');
      setLines([]);
    }
  }

  const userOptions = (users?.items ?? []).map((u) => ({
    value: u.id,
    label: u.displayName,
    avatarUrl: u.avatarUrl ?? null,
  }));

  function patchLine(key: number, patch: Partial<InstructionLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit() {
    if (!letter || !text.trim() || issue.isPending) return;
    const instructions = lines
      .filter((l) => l.text.trim() && l.assigneeId)
      .map((l) => ({
        text: l.text.trim(),
        assigneeId: l.assigneeId as string,
        deadline: l.deadline ? localDateStr(l.deadline) : null,
      }));
    issue.mutate({ text: text.trim(), instructions }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl bg-card">
        <DialogTitle className="text-base font-semibold text-foreground">
          {ui.letters.resolutionTitle}
        </DialogTitle>
        <div className="mt-2 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.letters.resolutionText}
            </span>
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ui.letters.resolutionTextPlaceholder}
              rows={3}
              className="resize-none"
            />
          </label>

          <div className="flex flex-col gap-2">
            <NodeLabel label={ui.letters.instructions} count={lines.length} />
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <Input
                  value={line.text}
                  onChange={(e) => patchLine(line.key, { text: e.target.value })}
                  placeholder={ui.letters.resolutionInstructionPlaceholder}
                  className="h-8 min-w-0 flex-1 text-sm"
                />
                <div className="flex w-48 shrink-0 items-center">
                  <FilterCombobox
                    options={userOptions}
                    value={line.assigneeId}
                    onChange={(v) => patchLine(line.key, { assigneeId: v })}
                    ariaLabel={ui.letters.resolutionAssignee}
                    placeholder={ui.letters.resolutionAssignee}
                  />
                </div>
                <div className="w-40 shrink-0">
                  <DateTimePicker
                    value={line.deadline}
                    onChange={(v) => patchLine(line.key, { deadline: v })}
                    ariaLabel={ui.letters.deadline}
                  />
                </div>
                <button
                  type="button"
                  aria-label={ui.common.close}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  lineSeq += 1;
                  const nextKey = lineSeq;
                  // Дефолт строки — адресат документа (обычный маршрут расписи).
                  setLines((prev) => [
                    ...prev,
                    {
                      key: nextKey,
                      text: '',
                      assigneeId: letter?.registration?.addressee?.id,
                      deadline: null,
                    },
                  ]);
                }}
              >
                <Plus data-icon="inline-start" />
                {ui.letters.resolutionInstructionAdd}
              </Button>
              <span className="text-xs text-muted-foreground">
                {ui.letters.resolutionNoInstruction}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
          {/* Аватар автора резолюции — текущий пользователь (расписывает адресат) */}
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {letter?.registration?.addressee ? (
              <>
                <PersonAvatar
                  name={letter.registration.addressee.displayName}
                  className="size-5 shrink-0"
                />
                <span className="truncate">{letter.registration.addressee.displayName}</span>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {ui.common.cancel}
            </Button>
            <Button size="sm" disabled={!text.trim() || issue.isPending} onClick={submit}>
              {ui.letters.resolutionCompose}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
