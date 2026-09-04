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

const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#4e7e80', fg: '#f4ead6' },
  { bg: '#c9973b', fg: '#201509' },
  { bg: '#b0512c', fg: '#f4ead6' },
  { bg: '#7c8a6e', fg: '#f4ead6' },
  { bg: '#5b7f9d', fg: '#f4ead6' },
  { bg: '#e6ddc6', fg: '#2c2a22' },
];

/** Детерминированный приглушённый тон аватара от имени (советская палитра). */
function toneOf(name: string): { bg: string; fg: string } {
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
    <Avatar className={cn('size-8 ring-1 ring-black/25', className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback
        className="crayon-fill text-xs font-semibold"
        style={{ backgroundColor: tone.bg, color: tone.fg }}
      >
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
