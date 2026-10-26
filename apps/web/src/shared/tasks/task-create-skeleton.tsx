/** Типы грузятся — скелет низа окна создания (#432): габарит не прыгает,
 *  пока приходит библиотека типов. */
export function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid grid-cols-[8rem_1fr] items-center gap-x-3">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-8 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
