import type { CSSProperties, ReactNode } from 'react';

import { parseMentionSegments } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { personTone, personToneVar } from '../ui/person-tone.js';

/**
 * Чип @упоминания (#176, модель Slack): inline-токен `@[текст](user:id)`
 * рендерится пилюлей персонального цвета упомянутого (#180 — тон
 * идентичности человека в любом хосте; палитра --name-1..7 текстопригодна
 * на пузырях обеих тем). Клик в ленте — карточка сотрудника; токен из
 * текста убирается парсером (contracts), чип — его визуальная замена.
 */

/** Фон-пилюля чипа: мягкий тинт персонального тона (не заливка — текст
 *  читаем на пузыре любого тона, канон тинта цитат #187 п.8). */
function chipStyle(userId: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in oklch, ${personToneVar(userId)} 14%, transparent)`,
  };
}

/** Чип в ленте: кнопка-ссылка на карточку сотрудника. Токен чипа не
 *  разрывается переносом строки (nowrap-поведение inline-flex + truncate
 *  длинных ФИО на узких панелях). */
export function MentionChip({ id, label }: { id: string; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openCardViaBridge({ kind: 'employee', id });
      }}
      style={chipStyle(id)}
      className={cn(
        'mx-0.5 inline-flex max-w-full items-baseline truncate rounded-md px-1 align-baseline',
        'font-medium transition-[filter] hover:brightness-110',
        personTone(id),
      )}
    >
      {label || '@'}
    </button>
  );
}

/** Чип сниппетов (цитата-ответ, панель поиска, «Избранное», закреп): без
 *  интерактива — строка-хост сама кликабельна (прыжок), вложенная кнопка
 *  ломала бы её семантику; тон и пилюля — те же, размер наследует хост. */
export function MentionChipMuted({ id, label }: { id: string; label: string }) {
  return (
    <span
      style={chipStyle(id)}
      className={cn(
        'inline-flex max-w-full truncate rounded-md px-1 font-medium',
        personTone(id),
      )}
    >
      {label || '@'}
    </span>
  );
}

/** Текст сниппета сегментами (пассивные чипы): общий хелпер однострочных
 *  preview — цитаты, строки выдачи, закреп; пустой label → «@». */
export function mentionSnippetNodes(text: string): ReactNode[] {
  return parseMentionSegments(text).map((segment, i) =>
    segment.kind === 'mention' ? (
      <MentionChipMuted key={i} id={segment.id} label={segment.label} />
    ) : (
      <span key={i}>{segment.value}</span>
    ),
  );
}

/** Сниппет с чипами упоминаний: без токенов — сырой текст (DOM хоста не
 *  меняется), с токенами — пассивные чипы. */
export function MentionSnippet({ text }: { text: string }) {
  if (!text.includes('@[')) return <>{text}</>;
  return <>{mentionSnippetNodes(text)}</>;
}
