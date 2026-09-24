import { Paperclip } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Drop-зона файлов ленты (A1, #87): перетаскивание файлов на область чата —
 * оверлей «Отпустите, чтобы прикрепить» (Discord/Telegram-канон). Guard от
 * классического бага dragleave на детях — счётчик enter/leave (research).
 * Пунктирная рама — разрешённый affordance переноса (исключение канона
 * «пустые состояния без пунктира», как drop-зона канбана).
 */
export function FeedDropzone({
  onFiles,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  className?: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  return (
    <div
      className={cn('relative min-h-0 min-w-0', className)}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setActive(false);
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setActive(false);
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {active ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-1.5 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-info/60 bg-background/85"
        >
          <Paperclip className="size-6 text-info" strokeWidth={1.75} />
          <span className="text-sm font-medium text-foreground">{ui.chat.dropToAttach}</span>
        </div>
      ) : null}
    </div>
  );
}
