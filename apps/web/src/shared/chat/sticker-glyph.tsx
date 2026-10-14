/**
 * Рендер одного стикера (#143): WebM (Telegram-формат) — беззвучное
 * зацикленное видео; WebP/PNG — img (анимированный WebP играет сам,
 * прозрачность работает во всех браузерах — Safari не умеет alpha у WebM).
 * Отдельный модуль (#288): глиф нужен и цитате ответа (message-headers) —
 * импорт из sticker-message давал бы цикл (там импортируется ReplyHeader).
 */
export function StickerGlyph({
  url,
  mime,
  alt,
  className,
}: {
  url: string;
  mime: string;
  alt?: string;
  className?: string;
}) {
  if (mime === 'video/webm') {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        className={className}
        aria-label={alt}
      />
    );
  }
  return <img src={url} alt={alt ?? ''} draggable={false} className={className} />;
}
