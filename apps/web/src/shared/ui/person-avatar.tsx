import { Avatar, AvatarFallback, AvatarImage } from '@nodus/ui/components/avatar';
import { cn } from '@nodus/ui/lib/utils';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Графитовая палитра «Инструмента»: оттенки серого, без семантики в цвете. */
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#26262b', fg: '#d9d9d6' },
  { bg: '#303036', fg: '#e8e8e6' },
  { bg: '#3a3a41', fg: '#e8e8e6' },
  { bg: '#45454d', fg: '#f0f0ee' },
  { bg: '#d9d9d6', fg: '#0a0a0b' },
];

/** Детерминированный тон аватара от имени. */
export function toneOf(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0]!;
}

export function PersonAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  const tone = toneOf(name);
  return (
    <Avatar className={cn('size-8 ring-1 ring-border', className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback
        className="text-xs font-semibold"
        style={{ backgroundColor: tone.bg, color: tone.fg }}
      >
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
