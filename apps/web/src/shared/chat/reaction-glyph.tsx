import { cn } from '@nodus/ui/lib/utils';

import { reactionAsset } from './reaction-presets.js';

/**
 * Глиф реакции (#124): анимированный WebP из пресетного набора (Noto Animated
 * Emoji by Google, CC BY 4.0) или текстовый глиф браузера для эмодзи вне пресета (чужие
 * реакции не ограничены нашим набором). WebP браузеры играют нативно —
 * без библиотек и рантайм-плееров (I11: ассеты self-hosted).
 */
export function ReactionGlyph({ emoji, className }: { emoji: string; className?: string }) {
  const asset = reactionAsset(emoji);
  if (asset) {
    return (
      <img src={asset} alt={emoji} draggable={false} className={cn('object-contain', className)} />
    );
  }
  return (
    <span aria-hidden className={className}>
      {emoji}
    </span>
  );
}
