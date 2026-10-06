import { describe, expect, it } from 'vitest';

import {
  applyEditToMentions,
  fromWireText,
  insertMentionDraft,
  mentionIndexAtKey,
  mentionIndexAtOffset,
  removeMentionDraft,
  replaceMentionLabelDraft,
  toWireText,
  type DraftMention,
} from './composer-mention-registry.js';

/** Реестр упоминаний черновика (#228): в поле ВИДИМЫЙ текст — имя без «@»
 *  (dev-фидбек 06.10), привязка — диапазонами, wire-токены пересобираются
 *  на отправке. Всё чистые функции. */

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const m = (start: number, end: number, id: string, label: string): DraftMention => ({
  start,
  end,
  id,
  label,
});

describe('fromWireText / toWireText — симметрия wire↔display', () => {
  it('токены → display: просто имена, без @ (dev-фидбек #228)', () => {
    const { text, mentions } = fromWireText(
      `привет @[Борис](user:${UUID_A}) и @[Все](user:all) пока`,
    );
    expect(text).toBe('привет Борис и Все пока');
    expect(mentions).toEqual([m(7, 12, UUID_A, 'Борис'), m(15, 18, 'all', 'Все')]);
  });

  it('display + реестр → wire (круговая симметрия)', () => {
    const wire = `привет @[Борис Ночной](user:${UUID_A}) и @[Все](user:all) пока`;
    const { text, mentions } = fromWireText(wire);
    expect(toWireText(text, mentions)).toBe(wire);
  });

  it('сырой текст без токенов — без реестра, wire = вход', () => {
    const { text, mentions } = fromWireText('просто @текст без токенов');
    expect(text).toBe('просто @текст без токенов');
    expect(mentions).toEqual([]);
    expect(toWireText(text, mentions)).toBe('просто @текст без токенов');
  });
});

describe('applyEditToMentions — правки текста', () => {
  const mentions = [m(0, 5, UUID_A, 'Борис')];
  const text = 'Борис привет';

  it('вставка ВНУТРЬ имени инвалидирует чип (правка label — поповером)', () => {
    expect(applyEditToMentions(mentions, text, 'Бориc привет')).toEqual([]);
  });

  it('вставка сразу ЗА чипом — чип цел (зазор = честный пробел текста)', () => {
    expect(applyEditToMentions(mentions, text, 'Борис, привет')).toEqual(mentions);
  });

  it('вставка ПЕРЕД чипом сдвигает диапазон', () => {
    expect(applyEditToMentions(mentions, text, 'эй Борис привет')).toEqual([
      m(3, 8, UUID_A, 'Борис'),
    ]);
  });

  it('правка ВНУТРИ первого имени инвалидирует его, хвостовой чип сдвигается', () => {
    const two = [m(0, 3, UUID_B, 'Все'), m(4, 10, UUID_A, 'Борис')]; // 'Все Борис'
    expect(applyEditToMentions(two, 'Все Борис', 'Вс Борис')).toEqual([m(3, 9, UUID_A, 'Борис')]);
  });

  it('удаление символа ПЕРЕД чипом подтягивает диапазон', () => {
    const two = [m(2, 5, UUID_B, 'Все'), m(6, 11, UUID_A, 'Борис')]; // 'а Все Борис'
    expect(applyEditToMentions(two, 'а Все Борис', ' Все Борис')).toEqual([
      m(1, 4, UUID_B, 'Все'),
      m(5, 10, UUID_A, 'Борис'),
    ]);
  });

  it('вырезание чипа выделением убирает и привязку', () => {
    expect(applyEditToMentions(mentions, text, ' привет')).toEqual([]);
  });

  it('вставка ПЕРЕД чужим чипом не убивает его (дифф склонён к границе)', () => {
    const base = fromWireText(`@[Все](user:all) и далее`);
    const next = `x${base.text}`;
    expect(applyEditToMentions(base.mentions, base.text, next)).toEqual([m(1, 4, 'all', 'Все')]);
  });
});

describe('insertMentionDraft / replaceMentionLabelDraft / removeMentionDraft', () => {
  it('вставка: @запрос → ИМЯ + пробел, каретка за пробелом, реестр растёт', () => {
    // atStart — позиция '@' запроса (query.start автокомплита)
    const res = insertMentionDraft('напишу @бо потом', [], 7, 10, UUID_A, 'Борис Ночной');
    // за заменой остаётся исходный пробел — двойной пробел допустим (Slack)
    expect(res?.text).toBe('напишу Борис Ночной  потом');
    expect(res?.mentions).toEqual([m(7, 19, UUID_A, 'Борис Ночной')]);
    expect(res?.caret).toBe(20);
  });

  it('вставка между существующих чипов сдвигает хвостовые диапазоны', () => {
    const base = fromWireText(`@[Все](user:all) и @[Борис](user:${UUID_A})`);
    // display 'Все и Борис': вставка 'Вера' + пробел на позиции 6 (перед 'Борис')
    const res = insertMentionDraft(base.text, base.mentions, 6, 6, UUID_B, 'Вера');
    expect(res?.text).toBe('Все и Вера Борис');
    expect(res?.mentions.map((x) => x.label)).toEqual(['Все', 'Вера', 'Борис']);
    // хвостовой чип сдвинулся на длину вставки 'Вера ' = 5
    expect(res?.mentions[2]?.start).toBe(base.mentions[1]!.start + 5);
  });

  it('label с `]` чистится (грамматика wire симметрична)', () => {
    const res = insertMentionDraft('@', [], 0, 1, UUID_A, 'Ива]н');
    expect(res?.text).toBe('Иван ');
  });

  it('правка label сохраняет привязку и сдвигает хвост', () => {
    const base = fromWireText(`@[Борис](user:${UUID_A}) и @[Все](user:all)`);
    const res = replaceMentionLabelDraft(base.text, base.mentions, 0, 'Бор');
    expect(res?.text).toBe('Бор и Все');
    expect(res?.mentions).toEqual([m(0, 3, UUID_A, 'Бор'), m(6, 9, 'all', 'Все')]);
  });

  it('удаление чипа уносит текст диапазона', () => {
    const base = fromWireText(`@[Борис](user:${UUID_A}) привет`);
    const res = removeMentionDraft(base.text, base.mentions, 0);
    expect(res.text).toBe(' привет');
    expect(res.mentions).toEqual([]);
  });
});

describe('атомарные клавиши и попадание клика', () => {
  const base = fromWireText(`привет @[Борис](user:${UUID_A}) пока`);
  // display: 'привет Борис пока', диапазон [7,12)

  it('Backspace у конца и ВНУТРИ чипа атомарны; Delete у начала', () => {
    expect(mentionIndexAtKey(base.mentions, 12, 'Backspace')).toBe(0);
    expect(mentionIndexAtKey(base.mentions, 10, 'Backspace')).toBe(0);
    expect(mentionIndexAtKey(base.mentions, 7, 'Delete')).toBe(0);
    expect(mentionIndexAtKey(base.mentions, 2, 'Backspace')).toBeNull();
    expect(mentionIndexAtKey(base.mentions, 13, 'Backspace')).toBeNull();
  });

  it('клик по подчёркнутому имени попадает в чип, мимо — нет', () => {
    expect(mentionIndexAtOffset(base.mentions, 7)).toBe(0);
    expect(mentionIndexAtOffset(base.mentions, 11)).toBe(0);
    expect(mentionIndexAtOffset(base.mentions, 2)).toBeNull();
    expect(mentionIndexAtOffset(base.mentions, 13)).toBeNull();
  });
});
