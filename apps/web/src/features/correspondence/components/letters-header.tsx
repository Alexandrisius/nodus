import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';

/** Шапка раздела (h-14, без нижней линии — канон журналов): «Корреспонденция»
 *  со счётчиком голым числом и инструменты вкладки справа от заголовка. */
export function LettersHeader({ count, children }: { count?: number; children?: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-6">
      <h1 className="shrink-0 text-xl font-semibold text-balance text-foreground">
        {ui.letters.title}
        {count !== undefined ? (
          <span className="ml-2 align-middle font-mono text-label-lg font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
      </h1>
      {children}
    </div>
  );
}
