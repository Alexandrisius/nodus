import { cn } from '@nodus/ui/lib/utils';

export interface ChainNode {
  /** Моно-метка типа узла (ПИСЬМО, РЕЗОЛЮЦИЯ…). */
  caption: string;
  /** Ключ узла (Вх-2026/118, ПП-57, № 105). */
  ref: string;
  /** Короткое содержание. */
  label: string;
  /** Статус узла, если есть («Согласовано»). */
  state?: string;
  /** Текущая сущность — светящийся узел. */
  active?: boolean;
  onClick?: () => void;
}

/** Горизонтальное ребро между узлами: линия с портами по концам (центровка
 * трансформами, не «на глаз»). */
function ChainEdge() {
  return (
    <span aria-hidden className="relative mx-1 h-px w-7 shrink-0 self-center bg-edge">
      <span className="absolute top-1/2 left-0 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-port" />
      <span className="absolute top-1/2 right-0 size-[5px] translate-x-1/2 -translate-y-1/2 rounded-full bg-port" />
    </span>
  );
}

/**
 * Доменная цепочка сущности (реф 03-domain-chain): Письмо → Резолюция →
 * Поручение → Задача — компактные узлы-плашки, соединённые рёбрами с портами;
 * текущая сущность светится. Кликабельные узлы ведут к своим сущностям.
 */
export function DomainChain({ nodes, className }: { nodes: ChainNode[]; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-stretch', className)}>
      {nodes.map((node, i) => {
        const content = (
          <>
            <span className="block truncate font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {node.caption} · {node.ref}
            </span>
            <span className="mt-0.5 block truncate text-[13px] leading-snug font-medium">
              {node.label}
              {node.state ? (
                <span className="ml-1.5 font-mono text-[10px] font-normal text-success">
                  {node.state}
                </span>
              ) : null}
            </span>
          </>
        );
        const classes = cn(
          'min-w-0 max-w-56 rounded-lg border px-3 py-1.5 text-left transition-colors',
          node.active
            ? 'border-port/60 bg-card text-foreground shadow-[0_0_10px_var(--glow)]'
            : 'border-border bg-card/60 text-card-foreground',
          node.onClick && 'cursor-pointer hover:border-input',
        );
        return (
          <span key={`${node.caption}-${node.ref}`} className="flex min-w-0 items-stretch">
            {i > 0 ? <ChainEdge /> : null}
            {node.onClick ? (
              <button type="button" onClick={node.onClick} className={classes}>
                {content}
              </button>
            ) : (
              <span className={classes}>{content}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
