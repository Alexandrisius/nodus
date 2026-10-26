import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';

/** Шапка раздела (h-14, без нижней линии — канон журналов): «Корреспонденция»
 *  со счётчиком голым числом («50+» — есть недогруженные страницы) и
 *  инструменты вкладки справа от заголовка. Место счётчика зарезервировано:
 *  строка инструментов не прыгает, когда число приходит. */
export function LettersHeader({
  count,
  children,
}: {
  count?: number | string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 px-6">
      <h1 className="flex shrink-0 items-baseline gap-2 text-xl font-semibold text-balance text-foreground">
        {ui.letters.title}
        <span className="inline-block min-w-8 font-mono text-label-lg font-normal text-muted-foreground tabular-nums">
          {count}
        </span>
      </h1>
      {children}
    </div>
  );
}
