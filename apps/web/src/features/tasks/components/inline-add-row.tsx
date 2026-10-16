import { useState, type ReactNode } from 'react';

/** Строка «+ Добавить …» в конце списка карточки (чек-лист, подзадачи;
 *  модель Linear/Jira): клик превращает её в поле той же высоты — Enter
 *  добавляет и оставляет поле для следующего, Esc или уход фокуса с пустым
 *  полем — выход. Никаких полноширинных инпутов с кнопкой-«кирпичом». */
export function InlineAddRow({
  label,
  icon,
  maxLength,
  onAdd,
}: {
  label: string;
  icon: ReactNode;
  maxLength: number;
  onAdd: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-2 flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
        {label}
      </button>
    );
  }

  return (
    <div className="-mx-2 flex min-h-8 items-center gap-2.5 rounded-md bg-accent/40 px-2 py-1">
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <input
        autoFocus
        value={text}
        maxLength={maxLength}
        aria-label={label}
        placeholder={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const value = text.trim();
            if (value) onAdd(value);
            setText('');
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setText('');
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
