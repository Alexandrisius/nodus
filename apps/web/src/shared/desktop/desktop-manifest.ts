import { z } from 'zod';

/**
 * Манифест раздачи оболочки `/desktop/latest.json` (#263): собирает
 * scripts/desktop-manifest.mjs, nginx web-контейнера абсолютизирует
 * относительные url под домен входа (sub_filter). Веб-кнопке нужен только
 * Windows-канал; подписи и MSI-цели Portal не интересуют.
 */
const platformEntrySchema = z.object({ url: z.string().url() });

export const desktopManifestSchema = z.object({
  version: z.string(),
  notes: z.string().optional(),
  pub_date: z.string().optional(),
  platforms: z.record(z.string(), platformEntrySchema),
});
export type DesktopManifest = z.infer<typeof desktopManifestSchema>;

/** Установщик Windows: NSIS-канал — основной, общий ключ — fallback. */
export function windowsInstallerUrl(manifest: DesktopManifest): string | null {
  return (
    manifest.platforms['windows-x86_64-nsis']?.url ??
    manifest.platforms['windows-x86_64']?.url ??
    null
  );
}

/** История релизов `/desktop/changelog.json` (CI собирает из GitHub Releases). */
export const desktopChangelogSchema = z.array(
  z.object({
    version: z.string(),
    date: z.string().nullable().optional(),
    notes: z.string(),
  }),
);
export type DesktopChangelog = z.infer<typeof desktopChangelogSchema>;

/**
 * Раздача отсутствует (артефакты не выложены) — это нормальное состояние
 * портала, а не ошибка: кнопка скачивания просто не показывается.
 */
export async function fetchDesktopManifest(): Promise<DesktopManifest | null> {
  try {
    const res = await fetch('/desktop/latest.json');
    if (!res.ok) return null;
    const parsed = desktopManifestSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** История опциональна: нет файла — попап живёт без секции «История». */
export async function fetchDesktopChangelog(): Promise<DesktopChangelog | null> {
  try {
    const res = await fetch('/desktop/changelog.json');
    if (!res.ok) return null;
    const parsed = desktopChangelogSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
