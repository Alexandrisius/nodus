import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MessageAttachment } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

/**
 * Лайтбокс изображения галереи (plan chat-attachments-plan, добро владельца
 * 14.09.2026): портал поверх интерфейса (z-80), Esc и клик по заднику —
 * закрыть, стрелки клавиатуры и кнопки по краям — листание, счётчик «N / M»
 * слева сверху. Фокус при открытии — на диалоге, при закрытии возвращается
 * плитке галереи (a11y); клики по самому фото и кнопкам не закрывают диалог.
 */
export function ImageLightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: MessageAttachment[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const image = images[index];

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    return () => restoreTo?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onIndex(Math.min(index + 1, images.length - 1));
      if (event.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onClose, onIndex]);

  if (!image) return null;

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 outline-none"
    >
      <span className="absolute top-3 left-4 font-mono text-xs text-white/70 tabular-nums">
        {index + 1} / {images.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={ui.common.close}
        className="absolute top-2.5 right-3 text-white/70 hover:bg-white/10 hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X />
      </Button>
      {index > 0 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ui.chat.photoPrev}
          className="absolute left-3 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onIndex(index - 1);
          }}
        >
          <ChevronLeft />
        </Button>
      ) : null}
      {index < images.length - 1 ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ui.chat.photoNext}
          className="absolute right-3 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onIndex(index + 1);
          }}
        >
          <ChevronRight />
        </Button>
      ) : null}
      <img
        src={image.url ?? image.thumbnailUrl ?? ''}
        alt={image.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
      />
    </div>,
    document.body,
  );
}
