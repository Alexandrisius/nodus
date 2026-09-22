import { useMemo } from 'react';

import { parseEntityLinks, type MessageSegment } from './entity-links.js';
import { linkPreviewFor } from './link-previews.js';

type EntitySegment = Extract<MessageSegment, { kind: 'entity' }>;

/** Текст сообщения: ссылки на сущности (portal:// и deep-link ?cards=)
 *  ЗАРЕГИСТРИРОВАННЫХ видов заменяются карточкой-превью (сырая ссылка из
 *  текста убирается — пересылка писем запрещена, вместо неё ссылка,
 *  вердикт владельца 22.09.2026); неизвестные виды остаются текстом. */
export function MessageText({ text }: { text: string }) {
  const segments = useMemo(() => parseEntityLinks(text), [text]);
  const entities = segments.filter(
    (s): s is EntitySegment => s.kind === 'entity' && linkPreviewFor(s.entity) !== undefined,
  );

  if (entities.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const visibleText = segments
    .filter((s) => s.kind === 'text')
    .map((s) => s.value)
    .join('')
    .trim();

  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      {visibleText ? <span className="whitespace-pre-wrap break-words">{visibleText}</span> : null}
      {entities.map((segment) => {
        const Preview = linkPreviewFor(segment.entity);
        return Preview ? <Preview key={`${segment.entity}:${segment.id}`} id={segment.id} /> : null;
      })}
    </span>
  );
}
