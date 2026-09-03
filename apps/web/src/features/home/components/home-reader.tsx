import type { CompanyNewsItem } from '@nodus/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';

import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

const df = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const sketchOf: Record<string, string> = {
  'c0000000-0000-4000-8000-000000000101': '/sketches/news-mayak.png',
  'c0000000-0000-4000-8000-000000000102': '/sketches/news-cake.png',
  'c0000000-0000-4000-8000-000000000103': '/sketches/news-bim.png',
  'c0000000-0000-4000-8000-000000000104': '/sketches/news-crane.png',
};

/** Ридер новости: бумажный лист с рисунком и полным текстом. */
export function HomeReader({
  item,
  onClose,
}: {
  item: CompanyNewsItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="paper-surface max-w-2xl overflow-y-auto rounded-xl border p-0 sm:rounded-xl">
        {item && (
          <>
            {sketchOf[item.id] && (
              <img
                src={sketchOf[item.id]}
                alt=""
                className="max-h-72 w-full rotate-[0.4deg] object-cover mix-blend-multiply opacity-95"
              />
            )}
            <DialogHeader className="px-6 pt-5">
              <DialogTitle className="text-lg">{item.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <PersonAvatar name={item.author.displayName} className="size-7" />
                {item.author.displayName} · {df.format(new Date(item.publishedAt))}
              </DialogDescription>
            </DialogHeader>
            <p className="px-6 pt-3 pb-6 text-sm leading-relaxed whitespace-pre-wrap">
              {item.text}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
