import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MessageAttachment } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Лайтбокс изображения галереи (plan chat-attachments-plan, добро владельца
 * 14.09.2026): портал поверх интерфейса (z-80), Esc и клик по заднику —
 * закрыть, стрелки клавиатуры и кнопки по краям — листание, счётчик «N / M»
 * слева сверху. Полноэкранное изображение — БЕЗ скруглений (#151: в углах
 * может быть важная информация; скругления — только у миниатюр в ленте). Фокус при открытии — на диалоге, при закрытии возвращается
 * плитке галереи (a11y); клики по самому фото и кнопкам не закрывают диалог.
 *
 * Размер кадра (#221): показываю в боксе min(natural, 85vw, 85vh·ratio) —
 * крупные вписываются в экран (Telegram-модель: downscale-only), мелкие
 * остаются в natural 1:1, апскейла нет (канон PhotoPrism viewport-mapping и
 * headless-lightbox minCoverage=0; research #221). Бокс задаётся ЯВНЫМИ
 * габаритами оригинала — контейнер не сжимается под потоковую миниатюру
 * (прошлая верстка рендерила 2400px-оригинал в 800px-бокс миниатюры).
 *
 * Прогрессивная загрузка (#150): пока грузится оригинал, кадр держит
 * миниатюра (кэш ленты) — обе absolute в одном аспект-боксе, пиксель в
 * пиксель (модель Medium). Фейд — только после подтверждённого декодирования
 * (img.decode(), MDN); сбой загрузки не молчит: авто-ретрай ×1 (ремоунт по
 * key), затем явная плашка «не удалось загрузить» с повтором.
 */

/** Источники кадра: полный = оригинал (url), миниатюра — только промежуточный
 *  кадр; равные источники не дублируются. Чистая — unit-тест (#221:
 *  регрессия «лайтбокс показывает url, а не thumbnailUrl»). */
export function resolveLightboxSources(image: Pick<MessageAttachment, 'url' | 'thumbnailUrl'>): {
  fullSrc: string;
  thumbSrc: string | null;
} {
  const fullSrc = image.url ?? image.thumbnailUrl ?? '';
  const thumbSrc = image.thumbnailUrl && image.thumbnailUrl !== fullSrc ? image.thumbnailUrl : null;
  return { fullSrc, thumbSrc };
}

/** Кадр показа из габаритов оригинала: явный aspect-бокс шириной
 *  min(85vw, 85vh·ratio, natural) — крупное вписывается в экран, мелкое
 *  остаётся 1:1. Без габаритов (старые строки) — null, потоковый фолбэк.
 *  Чистая — unit-тест. */
export function lightboxFrameStyle(
  width?: number | null,
  height?: number | null,
): CSSProperties | null {
  if (!width || width <= 0 || !height || height <= 0) return null;
  const ratio = width / height;
  return {
    width: `min(85vw, calc(85vh * ${ratio}), ${Math.round(width)}px)`,
    aspectRatio: `${width} / ${height}`,
  };
}

type FullPhase = 'loading' | 'ready' | 'error';

function LightboxImage({ image }: { image: MessageAttachment }) {
  const { fullSrc, thumbSrc } = resolveLightboxSources(image);
  const frame = lightboxFrameStyle(image.width, image.height);
  const [phase, setPhase] = useState<FullPhase>('loading');
  const [attempt, setAttempt] = useState(0);
  const fullRef = useRef<HTMLImageElement>(null);

  const showFull = () => {
    const settle = () => setPhase('ready');
    const img = fullRef.current;
    // Фейд после декодирования: без decode пустой кадр/мигание на больших PNG
    if (img && typeof img.decode === 'function') img.decode().then(settle, settle);
    else settle();
  };
  const failFull = () => {
    if (attempt < 1)
      setAttempt(attempt + 1); // один авто-ретрай — новый <img>
    else setPhase('error');
  };
  const retry = () => {
    setPhase('loading');
    setAttempt(attempt + 1);
  };

  const indicator =
    phase === 'loading' && thumbSrc ? (
      <span
        role="status"
        aria-label={ui.chat.lightboxLoading}
        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/55 p-1.5 text-white/85"
      >
        <Loader2 className="size-4 animate-spin" />
      </span>
    ) : null;

  const error =
    phase === 'error' ? (
      <span
        role="alert"
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-0 flex min-w-72 flex-col items-center justify-center gap-2 rounded-sm bg-black/65 text-white"
      >
        <AlertTriangle className="size-6 text-white/85" />
        <span className="text-sm">{ui.chat.lightboxLoadError}</span>
        <Button variant="outline" size="sm" onClick={retry}>
          {ui.chat.lightboxRetry}
        </Button>
      </span>
    ) : null;

  if (frame) {
    return (
      <span className="relative inline-flex" style={frame}>
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={image.name}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 size-full object-contain"
          />
        ) : null}
        <img
          key={attempt}
          ref={fullRef}
          src={fullSrc}
          alt={image.name}
          onLoad={showFull}
          onError={failFull}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute inset-0 size-full object-contain transition-opacity duration-200',
            phase === 'ready' ? 'opacity-100' : 'opacity-0',
          )}
        />
        {indicator}
        {error}
      </span>
    );
  }

  // Фолбэк без габаритов: прежняя потоковая схема, но с обработкой ошибок.
  return (
    <span className="relative inline-flex min-h-48 min-w-72 max-h-[85vh] max-w-[85vw]">
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={image.name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-[85vw] object-contain"
        />
      ) : null}
      <img
        key={attempt}
        ref={fullRef}
        src={fullSrc}
        alt={image.name}
        onLoad={showFull}
        onError={failFull}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'max-h-[85vh] max-w-[85vw] object-contain transition-opacity duration-200',
          thumbSrc && 'absolute inset-0 size-full',
          phase === 'ready' || (!thumbSrc && phase !== 'error') ? 'opacity-100' : 'opacity-0',
        )}
      />
      {indicator}
      {error}
    </span>
  );
}

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
      // Capture + stopPropagation: Esc гасит ТОЛЬКО лайтбокс, даже открытый
      // поверх Radix-диалога (окно отправки вложений, #144) — иначе document-
      // слушатель DismissableLayer закрыл бы и диалог под ним.
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') onIndex(Math.min(index + 1, images.length - 1));
      if (event.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0));
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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
      /* Поверх Radix-модалки (окно отправки вложений, #144): модал ставит
         body pointer-events:none, портал в body наследует это — лайтбокс
         был «прозрачен» для мыши, а клики мимо уходили в html и закрывали
         модал. pointer-events-auto возвращает хит-тест; pointerdown не
         всплывает до document-слушателей DismissableLayer модала. */
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/85 outline-none"
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
      <LightboxImage key={image.id} image={image} />
    </div>,
    document.body,
  );
}
