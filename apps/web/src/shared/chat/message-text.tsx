import { useMemo } from 'react';

import { parseMentionSegments, type MentionSegment } from '@nodus/contracts';

import { parseEntityLinks, type MessageSegment } from './entity-links.js';
import { linkPreviewFor } from './link-previews.js';
import { MentionChip } from './mention-chip.js';
import { ReactionGlyph } from './reaction-glyph.js';
import { reactionAsset } from './reaction-presets.js';

type EntitySegment = Extract<MessageSegment, { kind: 'entity' }>;
export type ContentSegment = MentionSegment | EntitySegment;

/** Есть ли в тексте карточки-превью сущностей (portal://ссылки)? Хосты меты
 *  времени переключают раскладку: flex-col текст с превью не дружит с
 *  inline-спейсером MetaCorner — там мета строкой ниже (#187 раунд 5). */
export function hasEntityPreviews(text: string): boolean {
  return parseEntityLinks(text).some(
    (s) => s.kind === 'entity' && linkPreviewFor(s.entity) !== undefined,
  );
}

/** Текст сообщения: межстрочный leading-tight (1.25 — плотность Telegram;
 *  вердикт #187 п.10: 1.375 (#181) читался просторнее телеграма). Ссылки
 *  на сущности (portal:// и deep-link ?cards=) ЗАРЕГИСТРИРОВАННЫХ видов
 *  заменяются карточкой-превью (сырая ссылка из текста убирается —
 *  пересылка писем запрещена, вместо неё ссылка, вердикт владельца
 *  22.09.2026); @упоминания-токены `@[текст](user:id)` — чипами
 *  персонального цвета (#176); без превью и чипов — сырой текст. */
/** Одиночный эмодзи сообщения (#130, канон Telegram single-emoji): крупный
 *  живой глиф — анимированный WebP из набора реакций, если анимация есть,
 *  иначе крупный глиф шрифтом Noto Color Emoji. */
function SingleEmoji({ emoji }: { emoji: string }) {
  if (reactionAsset(emoji)) {
    return <ReactionGlyph emoji={emoji} className="size-11" />;
  }
  return <span className="text-4xl leading-none">{emoji}</span>;
}

/** Inline-поток: текстовые куски и чипы упоминаний вперемешку (entity-URI
 *  уже вырезаны — их заменяют карточки ниже). */
function InlineContent({ segments }: { segments: MentionSegment[] }) {
  return (
    <span className="whitespace-pre-wrap break-words leading-tight">
      {segments.map((segment, i) =>
        segment.kind === 'mention' ? (
          <MentionChip key={i} id={segment.id} label={segment.label} />
        ) : (
          segment.value
        ),
      )}
    </span>
  );
}

export function MessageText({ text }: { text: string }) {
  // Упоминания — первыми: токен цельный, entity-ссылки ищутся в текстовых
  // кусках между чипами (токен не может содержать portal://).
  const segments = useMemo(() => parseMentionSegments(text), [text]);
  const entities = useMemo(
    () =>
      segments.flatMap((s): EntitySegment[] =>
        s.kind === 'text'
          ? parseEntityLinks(s.value).filter(
              (e): e is EntitySegment =>
                e.kind === 'entity' && linkPreviewFor(e.entity) !== undefined,
            )
          : [],
      ),
    [segments],
  );
  // Строка без превью-карточек: сырой текст + чипы (portal:// неизвестных
  // видов остаётся текстом — прежняя семантика).
  const inlineRaw = segments;
  const single =
    isSingleEmoji(text) && entities.length === 0 && !segments.some((s) => s.kind === 'mention');

  if (single) {
    return (
      <span data-slot="message-text" className="inline-block">
        <SingleEmoji emoji={text.trim()} />
      </span>
    );
  }

  if (entities.length === 0) {
    return (
      <span data-slot="message-text" className="inline-block">
        <InlineContent segments={inlineRaw} />
      </span>
    );
  }

  // Есть карточки-превью: entity-URI вырезаются из текста, карточки — ниже.
  const inline = segments.flatMap((s): MentionSegment[] =>
    s.kind === 'mention'
      ? [s]
      : parseEntityLinks(s.value).map((e): MentionSegment =>
          e.kind === 'text' ? e : { kind: 'text', value: '' },
        ),
  );
  const visibleText = inline
    .filter((s) => s.kind === 'text')
    .map((s) => s.value)
    .join('')
    .trim();

  return (
    <span data-slot="message-text" className="flex min-w-0 flex-col gap-1.5">
      {visibleText || inline.some((s) => s.kind === 'mention') ? (
        <InlineContent segments={inline} />
      ) : null}
      {entities.map((segment) => {
        const Preview = linkPreviewFor(segment.entity);
        return Preview ? <Preview key={`${segment.entity}:${segment.id}`} id={segment.id} /> : null;
      })}
    </span>
  );
}

/** Ровно один эмодзи-кластер в тексте (без пробелов/прочих символов)?
 *  Графемную сегментацию заменяет прагматика пилота: ZWJ-последовательность
 *  (учёный = человек+микроскоп) — ОДИН кластер; два отдельных эмодзи — уже
 *  два (канон Telegram single-emoji только для одного). */
export function isSingleEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 1 || trimmed.length > 24) return false;
  const eachPartIsPictographic = (part: string) =>
    [...part.replace(/[️]/gu, '')].every((ch) => /\p{Extended_Pictographic}/u.test(ch));
  // Без ZWJ допустим РОВНО один пиктографический символ (плюс VS16);
  // ZWJ-цепочка — один кластер, если каждая её часть пиктографическая.
  if (!trimmed.includes('‍')) {
    const chars = [...trimmed.replace(/[️]/gu, '')];
    return chars.length === 1 && /\p{Extended_Pictographic}/u.test(chars[0]!);
  }
  return trimmed.split('‍').every(eachPartIsPictographic);
}
