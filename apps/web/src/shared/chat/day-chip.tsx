/**
 * Дата-чип (план docs/mvp/chat-messages-plan.md): центрированный чип-разделитель
 * при смене дня — «Сегодня» / «Вчера» / «5 сентября». Метка — `formatDayLabel`
 * (message-groups.ts); сам чип — моно-мелочь на токенах, без хардкода строк.
 */
export function DayChip({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="flex justify-center">
      <span className="rounded-full bg-muted/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
