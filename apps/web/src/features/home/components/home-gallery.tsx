import { Camera } from 'lucide-react';
import type { CompanyPhoto } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/** Жизнь компании: радостные фото с подписями. */
export function HomeGallery({ photos }: { photos: CompanyPhoto[] }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white/90">
        <span className="flex size-7 items-center justify-center rounded-lg bg-pink-400/15 text-pink-300">
          <Camera className="size-4" />
        </span>
        {ui.home.lifeTitle}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-4">
        {photos.map((photo) => (
          <figure
            key={photo.id}
            className="relative overflow-hidden rounded-xl border border-white/10 shadow-lg shadow-black/30"
          >
            <img src={photo.src} alt={photo.caption} className="h-44 w-full object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8 text-xs text-white">
              {photo.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
