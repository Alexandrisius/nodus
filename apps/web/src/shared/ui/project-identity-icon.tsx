import { FolderKanban } from 'lucide-react';
import type { ProjectColor } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { identityTone } from './identity-tone.js';

/** Плитка-идентичность проекта: тонированный квадрат с глифом в тоне цвета
 *  проекта (референс команды владельца: цветные маркеры проектов в светлой
 *  теме; цвет = идентификатор, а не декор). Размер по месту: size-5 в строках
 *  таблиц, size-6 в шапках. */
export function ProjectIdentityIcon({
  color,
  className,
}: {
  color: ProjectColor;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-md border',
        identityTone[color].tile,
        className,
      )}
    >
      <FolderKanban className="size-3" strokeWidth={2} />
    </span>
  );
}
