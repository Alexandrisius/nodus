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

/** Детерминированный пастельный тон аватара от имени (как в Битриксе — цветные). */
function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
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
  return (
    <Avatar className={cn('size-8', className)}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback
        className="text-xs font-medium"
        style={{ backgroundColor: `oklch(0.8 0.09 ${hueOf(name)})`, color: 'oklch(0.3 0.05 262)' }}
      >
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
