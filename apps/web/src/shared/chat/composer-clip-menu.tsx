import { ChartColumn, FileText, Image, Paperclip } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nodus/ui/components/dropdown-menu';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { addFiles } from './composer-files.js';

/**
 * Скрепка композера (A1, #87): меню «Фото или видео» / «Файл» / «Опрос»-
 * заготовка со значками (канон tdesktop + вердикт 24.09). Геометрия попапа —
 * вердикты 24.09: радиус КАК у островка (rounded-2xl), левый край по
 * СКРУГЛЕНИЮ островка (alignOffset = островок.left − скрепка.left), низ ВЫШЕ
 * островка целиком (sideOffset от верха островка, модель Telegram: меню не
 * пересекает область ввода). Замеры — при открытии, оба offset в state.
 */
export function ComposerClipMenu({
  draftKey,
  islandRef,
  align,
  disabled = false,
}: {
  draftKey: string;
  islandRef: RefObject<HTMLSpanElement | null>;
  align: string;
  disabled?: boolean;
}) {
  const clipRef = useRef<HTMLButtonElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sideOffset, setSideOffset] = useState(4);
  const [alignOffset, setAlignOffset] = useState(0);

  function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(draftKey, Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open || !islandRef.current || !clipRef.current) return;
          const island = islandRef.current.getBoundingClientRect();
          const clip = clipRef.current.getBoundingClientRect();
          setSideOffset(Math.max(4, Math.round(clip.top - island.top) + 6));
          setAlignOffset(Math.round(island.left - clip.left));
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            ref={clipRef}
            type="button"
            variant="ghost"
            size="icon"
            className={cn('shrink-0 text-muted-foreground', align)}
            aria-label={ui.chat.attachFile}
            title={ui.chat.attachFile}
            disabled={disabled}
          >
            <Paperclip strokeWidth={1.75} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          alignOffset={alignOffset}
          side="top"
          sideOffset={sideOffset}
          className="w-56 rounded-2xl"
        >
          {/* Просторные строки меню (gap/padding как в tdesktop): текст и
              значок дышат и оптически выровнены (баг-вердикт 24.09). */}
          <DropdownMenuItem
            className="gap-2.5 rounded-xl px-2.5 py-2"
            onClick={() => photoInputRef.current?.click()}
          >
            <Image className="size-4" strokeWidth={1.75} />
            {ui.chat.attachPhoto}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2.5 rounded-xl px-2.5 py-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="size-4" strokeWidth={1.75} />
            {ui.chat.attachDocument}
          </DropdownMenuItem>
          {/* Опросы — заготовка без окна (вердикт 24.09): пункт и значок на
              месте, механика придёт со своим треком. */}
          <DropdownMenuItem
            className="gap-2.5 rounded-xl px-2.5 py-2"
            onClick={() => toast(ui.chat.pollSoon)}
          >
            <ChartColumn className="size-4" strokeWidth={1.75} />
            {ui.chat.attachPoll}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={onPickFiles}
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={onPickFiles}
        tabIndex={-1}
        aria-hidden
      />
    </>
  );
}
