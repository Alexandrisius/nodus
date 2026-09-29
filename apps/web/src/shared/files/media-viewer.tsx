import { ui } from '@nodus/contracts';

/**
 * Медиа-вьюер (#138): видео/аудио/изображение — нативные элементы браузера
 * (controls), без зависимостей. Изображение из не-галерейных хостов
 * (панель беседы, дровер) открывается тем же вьюером. Полноэкранный контент
 * — БЕЗ скруглений (#151, вердикт владельца 29.09: в углах картинки может
 * быть важная информация); скругления остаются у миниатюр в ленте.
 */
export function MediaViewer({ url, mime, name }: { url: string; mime: string; name: string }) {
  if (mime.startsWith('video/')) {
    return (
      <div className="grid size-full place-items-center p-6">
        <video
          key={url}
          src={url}
          controls
          autoFocus
          playsInline
          className="max-h-full max-w-full"
          aria-label={name}
        />
      </div>
    );
  }
  if (mime.startsWith('audio/')) {
    return (
      <div className="grid size-full place-items-center p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <span className="text-sm text-muted-foreground">{ui.files.mediaTitle}</span>
          <audio key={url} src={url} controls autoFocus className="w-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center p-6">
      <img key={url} src={url} alt={name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
