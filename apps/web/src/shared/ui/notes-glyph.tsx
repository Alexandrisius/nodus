import { Bookmark } from 'lucide-react';
import { cn } from '@nodus/ui/lib/utils';

/**
 * «Заметки» — сообщения самому себе (модель Битрикс24, вердикт владельца
 * 13.09.2026): закладка ВМЕСТО аватарки, чтобы свой профиль не дублировался
 * в коллегах и назначение строки читалось сразу. Круг — тем же языком
 * плашек/аватарок (rounded-full, тон muted), без яркости.
 */
export function NotesGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        className,
      )}
    >
      <Bookmark className="size-3.5" strokeWidth={1.75} />
    </span>
  );
}
