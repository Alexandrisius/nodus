import { z } from 'zod';

/**
 * Манифест раздачи оболочки `/desktop/latest.json` (#263): собирает
 * scripts/desktop-manifest.mjs, nginx web-контейнера абсолютизирует
 * относительные url под домен входа (sub_filter). Веб-кнопке нужен только
 * Windows-канал; подписи и MSI-цели Portal не интересуют.
 */
const platformEntrySchema = z.object({
  // Только http(s): javascript:/data: не проходят границу (security-аудит #263;
  // форма z.url({ protocols: [...] }) в zod 4.6.5 их НЕ отсекает — проверено)
  url: z.url({ protocol: /^https?$/ }),
});

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
