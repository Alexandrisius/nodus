import { Button } from '@nodus/ui/components/button';

/** Фирменная кнопка отправки — знак Nodus (гексагон-узел с тремя связями)
 * вместо самолётика (единая для чата и обсуждений сущностей). */
export function SendHexButton({ disabled, label }: { disabled?: boolean; label: string }) {
  return (
    <Button type="submit" size="icon" disabled={disabled} aria-label={label}>
      {/* Знак из мастера docs/mvp/logo/Nodus_иконка.svg (гексагон + три балки
          120° по вершинам + узлы на общей окружности) с оптикой мелких
          размеров: штрих и узлы толще пропорций мастера, балки выходят прямо
          из вершин (висячий зазор мастера в ~1px здесь рассыпается), марка
          центрирована по вертикали в квадрате глифа. Size-5 — оптическая масса
          как у Plus size-4 квадрата «добавить подзадачу» (#60 р2). */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
        aria-hidden
      >
        <polygon points="12,10.05 15.64,12.15 15.64,16.35 12,18.45 8.36,16.35 8.36,12.15" />
        <line x1="12" y1="10.05" x2="12" y2="6.65" />
        <line x1="8.36" y1="16.35" x2="5.42" y2="18.05" />
        <line x1="15.64" y1="16.35" x2="18.58" y2="18.05" />
        <g fill="currentColor" stroke="none">
          <circle cx="12" cy="5.25" r="1.9" />
          <circle cx="4.21" cy="18.75" r="1.9" />
          <circle cx="19.79" cy="18.75" r="1.9" />
        </g>
      </svg>
    </Button>
  );
}
