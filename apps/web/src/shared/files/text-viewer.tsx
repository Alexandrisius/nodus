import { useQuery } from '@tanstack/react-query';
import { ui } from '@nodus/contracts';
import { Spinner } from '@nodus/ui/components/spinner';

import { DownloadCard } from './download-card.js';

/** Потолок чтения текста в память вкладки: больше — карточка скачивания. */
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;

type TextPreview = { kind: 'text'; text: string } | { kind: 'too_large' };

/** Кодировка по BOM → charset заголовка → UTF-8. BOM важнее заголовка:
 *  выгрузки Windows (Revit/1С/Excel) в UTF-16 приходят как text/plain
 *  без charset, иначе кириллица превращается в «T h i s» с нулями. */
function encodingOf(head: Uint8Array, charset: string | undefined): string {
  if (head[0] === 0xff && head[1] === 0xfe) return 'utf-16le';
  if (head[0] === 0xfe && head[1] === 0xff) return 'utf-16be';
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return 'utf-8';
  return charset || 'utf-8';
}

function decoderFor(encoding: string): TextDecoder {
  try {
    return new TextDecoder(encoding);
  } catch {
    // Неизвестная кодировка — UTF-8 как безопасный дефолт.
    return new TextDecoder('utf-8');
  }
}

async function fetchText(url: string): Promise<TextPreview> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Текст файла: ${res.status}`);
  const charset = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '')?.[1]?.trim();
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return text.length > TEXT_PREVIEW_MAX_BYTES ? { kind: 'too_large' } : { kind: 'text', text };
  }
  // Стартовые байты: BOM может прийти не в самом первом чанке (прокси иногда
  // отдаёт пустой первый чанк) — копим до трёх ненулевых байт.
  const headChunks: Uint8Array[] = [];
  let headLen = 0;
  for (;;) {
    const first = await reader.read();
    if (first.done || first.value.byteLength > 0) {
      if (!first.done) {
        headChunks.push(first.value);
        headLen += first.value.byteLength;
      }
      if (first.done || headLen >= 3) break;
    }
  }
  const head = new Uint8Array(headLen);
  let offset = 0;
  for (const chunk of headChunks) {
    head.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const decoder = decoderFor(encodingOf(head, charset));
  let text = head.byteLength > 0 ? decoder.decode(head, { stream: true }) : '';
  let total = head.byteLength;
  if (total > TEXT_PREVIEW_MAX_BYTES) {
    await reader.cancel();
    return { kind: 'too_large' };
  }
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > TEXT_PREVIEW_MAX_BYTES) {
      await reader.cancel();
      return { kind: 'too_large' };
    }
    text += decoder.decode(value, { stream: true });
  }
  return { kind: 'text', text: text + decoder.decode() };
}

/**
 * Текстовый файл как есть (#56 → общий просмотрщик, вердикт владельца
 * 28.10): .txt/.log/.csv/.json и исходники HTML открываются читалкой, а не
 * карточкой «формат не открывается». Потолок 2 МБ — вкладку не топим,
 * больше — скачивание. `fit="width"` — гнездо карточки письма/конвейера.
 */
export function TextViewer({
  url,
  name,
  size,
  fit,
}: {
  url: string;
  name: string;
  size: number;
  fit?: 'width';
}) {
  const query = useQuery({
    queryKey: ['files', 'text', url],
    queryFn: () => fetchText(url),
    staleTime: Infinity,
    retry: 1,
  });

  if (size > TEXT_PREVIEW_MAX_BYTES || query.data?.kind === 'too_large') {
    return <DownloadCard name={name} size={size} url={url} reason="too_large" />;
  }
  if (query.isError) {
    return (
      <div className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">
        {ui.files.textOpenError}
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="grid size-full place-items-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className={fit ? 'size-full overflow-auto px-6 py-5' : 'size-full overflow-auto p-4'}>
      <pre className="mx-auto max-w-3xl font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground wrap-anywhere">
        {query.data.text}
      </pre>
    </div>
  );
}
