import { ui } from '@nodus/contracts';

/**
 * Медиа-вьюер (#138): видео/аудио/изображение — нативные элементы браузера
 * (controls), без зависимостей. Изображение из не-галерейных хостов
 * (панель беседы, дровер) открывается тем же вьюером. Полноэкранный контент
 * — БЕЗ скруглений (#151, вердикт владельца 29.09: в углах картинки может
 * быть важная информация); скругления остаются у миниатюр в ленте.
 */
export function MediaViewer({
  url,
  mime,
  name,
  fit,
  autoFocus = true,
}: {
  url: string;
  mime: string;
  name: string;
  /** Изображение по ширине панели со скроллом (скан письма, #55). */
  fit?: 'width';
  /** Фокус плеера: модалка — да, вкладка карточки — нет (не крадёт ввод). */
  autoFocus?: boolean;
}) {
  if (mime.startsWith('video/')) {
    return (
      <div className="grid size-full place-items-center p-6">
        <video
          key={url}
          src={url}
          controls
          autoFocus={autoFocus}
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
          <audio key={url} src={url} controls autoFocus={autoFocus} className="w-full" />
        </div>
      </div>
    );
  }
  if (fit === 'width') {
    return (
      <div className="size-full overflow-auto bg-muted/40 p-4">
        <img
          key={url}
          src={url}
          alt={name}
          className="mx-auto block h-auto w-full max-w-[1200px]"
        />
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center p-6">
      <img key={url} src={url} alt={name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
