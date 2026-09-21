import type { ReactNode } from 'react';
import { cn } from '#lib/utils';

import { NodeLabel } from './node-label';

/** Карточка-панель «инструмента»: плоская панель с моно-заголовком раздела. */
function NodeCard({
  label,
  count,
  actions,
  children,
  className,
  contentClassName,
}: {
  label?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('node-panel', className)}>
      {label ? (
        <header className="flex h-10 items-center justify-between gap-3 border-b border-border px-4">
          <NodeLabel label={label} count={count} />
          {actions}
        </header>
      ) : null}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  );
}

export { NodeCard };
