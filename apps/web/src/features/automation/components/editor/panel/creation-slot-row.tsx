import type { CreationFieldSlot } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { ChevronRight, CircleAlert, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Строка поля в панели «Окно создания» (#432, Р12) — та же грамматика, что
 * «Название ›» панели (`SectionLink`): подпись (своё название или
 * стандартное), под ней сводка («Дата · обязательно», «Скрыто: Высокий»),
 * шеврон — переход внутрь, в раздел поля. Слева — ручка перетаскивания
 * (dnd-kit, с клавиатуры: Пробел — взять, стрелки — нести). Сводка есть
 * всегда, поэтому высота строки не прыгает от смены режима поля (метка
 * «Обязательно» раньше раздувала шапку — баг-вердикт владельца 26.10.2026).
 * Проблема публикации — красной сводкой вместо обычной.
 */
export function CreationSlotRow({
  slot,
  label,
  summary,
  problem,
  readOnly,
  onOpen,
}: {
  slot: CreationFieldSlot;
  label: string;
  summary: string;
  /** Текст первой проблемы публикации у поля (есть — строка подсвечена). */
  problem: string | null;
  readOnly: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.key,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group -mx-2 flex min-w-0 items-center gap-1 rounded-lg transition-colors hover:bg-accent/60',
        readOnly ? 'px-2' : 'pr-2 pl-0.5',
        isDragging && 'relative z-10 bg-accent',
      )}
    >
      {readOnly ? null : (
        <button
          type="button"
          aria-label={`${ui.automation.creation.dragHandle}: ${label}`}
          className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors group-hover:text-muted-foreground focus-visible:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-2 text-left"
      >
        <span className="text-sm break-words">{label}</span>
        <span
          className={cn('text-xs break-words', problem ? 'text-danger' : 'text-muted-foreground')}
        >
          {problem ?? summary}
        </span>
      </button>
      {problem ? (
        <CircleAlert className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
      ) : null}
      {/* Шеврон — часть кликабельной строки (дубль основной кнопки для мыши). */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onOpen}
        className="flex self-stretch items-center"
      >
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </button>
    </div>
  );
}
