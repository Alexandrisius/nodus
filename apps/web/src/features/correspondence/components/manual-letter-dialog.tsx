import { Loader2, Star, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { LETTER_LIMITS, ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nodus/ui/components/select';
import { cn } from '@nodus/ui/lib/utils';

import { FileTypeIcon } from '../../../shared/files/file-type-icon.js';
import { formatBytes, plural } from '../../../shared/lib/format.js';
import { useCreateManualLetter } from '../api/letters-mutations.js';
import { useLetterTypes } from '../api/letters-queries.js';

/**
 * «Создать вручную» (#55, U4): бумажное письмо — скан и приложения одним
 * multipart-запросом; письмо встаёт в «Новые» и выбирается в конвейере.
 * Перетаскивание или выбор файлов, «главный документ» — первый (меняется
 * звёздочкой), ошибки размера и числа — до отправки. Тип — только если
 * входящих типов больше одного. Пессимистично: файлы и письмо атомарны.
 */
export function ManualLetterDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (letter: LetterDetail) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mainIndex, setMainIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const create = useCreateManualLetter();
  const { data: types = [] } = useLetterTypes();
  const incoming = types.filter((t) => t.direction === 'incoming' && t.creatable && !t.archivedAt);
  const chosenType = typeId ?? incoming[0]?.id ?? null;

  const tooMany = files.length > LETTER_LIMITS.files;
  const tooLarge = files.some((file) => file.size > LETTER_LIMITS.fileBytes);
  const canSubmit =
    files.length > 0 && !tooMany && !tooLarge && chosenType !== null && !create.isPending;

  function reset() {
    setFiles([]);
    setMainIndex(0);
    setProgress(null);
    setTypeId(null);
    create.reset();
  }

  function close(next: boolean) {
    if (create.isPending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function add(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function remove(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setMainIndex((main) => (index === main ? 0 : index < main ? main - 1 : main));
  }

  function submit() {
    if (!canSubmit || !chosenType) return;
    create.mutate(
      { typeId: chosenType, files, mainIndex, onProgress: setProgress },
      {
        onSuccess: (letter) => {
          onCreated(letter);
          onOpenChange(false);
          reset();
        },
        onSettled: () => setProgress(null),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        className="flex max-h-[90vh] max-w-[560px] flex-col gap-4 rounded-[14px] p-5 sm:max-w-[560px]"
      >
        <DialogHeader>
          <DialogTitle>{ui.letters.manual.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {ui.letters.manual.lead}
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center gap-2 rounded-[14px] border border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-port bg-accent/40' : 'border-border',
          )}
        >
          <Upload className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-muted-foreground">{ui.letters.manual.drop}</p>
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {ui.letters.manual.pick}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {files.length > 0 ? (
          <ul
            className="flex min-h-0 flex-col gap-1 overflow-y-auto"
            aria-label={ui.letters.fields.files}
          >
            {files.map((file, index) => {
              const main = index === mainIndex;
              const large = file.size > LETTER_LIMITS.fileBytes;
              return (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-accent/40"
                >
                  <FileTypeIcon
                    mime={file.type}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm" title={file.name}>
                      {file.name}
                    </span>
                    <span
                      className={cn(
                        'block text-xs',
                        large ? 'text-danger' : 'text-muted-foreground',
                      )}
                    >
                      <span className="font-mono tabular-nums">{formatBytes(file.size)}</span>
                      {large ? ` — ${ui.letters.manual.tooLarge}` : null}
                      {main ? ` · ${ui.letters.manual.main}` : null}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={main}
                    aria-label={main ? ui.letters.manual.main : ui.letters.manual.makeMain}
                    title={main ? ui.letters.manual.main : ui.letters.manual.makeMain}
                    onClick={() => setMainIndex(index)}
                    className={main ? 'text-port' : 'text-muted-foreground'}
                  >
                    <Star className={cn(main && 'fill-current')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={ui.letters.manual.remove}
                    title={ui.letters.manual.remove}
                    onClick={() => remove(index)}
                    className="text-muted-foreground"
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {tooMany ? <p className="text-xs text-danger">{ui.letters.manual.tooMany}</p> : null}

        {incoming.length > 1 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {ui.letters.manual.type}
            </span>
            <Select value={chosenType ?? undefined} onValueChange={setTypeId}>
              <SelectTrigger className="h-8 w-full text-sm" aria-label={ui.letters.manual.type}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {incoming.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={create.isPending}>
            {ui.common.cancel}
          </Button>
          <Button onClick={submit} disabled={!canSubmit} aria-busy={create.isPending || undefined}>
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            {ui.letters.manual.submit}
            {files.length > 0 ? (
              <span className="font-mono text-xs tabular-nums opacity-80">
                {progress !== null
                  ? `${Math.round(progress * 100)}%`
                  : `${files.length} ${plural(files.length, ui.letters.manual.files)}`}
              </span>
            ) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
