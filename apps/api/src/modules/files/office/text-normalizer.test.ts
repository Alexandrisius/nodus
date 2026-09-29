import { describe, expect, it } from 'vitest';

import { needsTextNormalization, normalizeTextForOffice } from './text-normalizer.js';

describe('text-normalizer (#138)', () => {
  it('нормализация нужна только текстовым форматам буферизуемого размера', () => {
    expect(needsTextNormalization('заметка.txt', 100)).toBe(true);
    expect(needsTextNormalization('таблица.csv', 100)).toBe(true);
    expect(needsTextNormalization('данные.tsv', 100)).toBe(true);
    expect(needsTextNormalization('смета.docx', 100)).toBe(false);
    expect(needsTextNormalization('архив.zip', 100)).toBe(false);
    expect(needsTextNormalization('огромный.txt', 6 * 1024 * 1024)).toBe(false);
    expect(needsTextNormalization('пустой.txt', 0)).toBe(false);
  });

  it('UTF-8 без BOM → BOM добавляется, текст сохраняется', () => {
    const out = normalizeTextForOffice(Buffer.from('Смета: бетон', 'utf-8'));
    expect([...out.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(out.subarray(3).toString('utf-8')).toBe('Смета: бетон');
  });

  it('уже с BOM — байты не меняются (идемпотентность)', () => {
    const src = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ок', 'utf-8')]);
    expect(normalizeTextForOffice(src).equals(src)).toBe(true);
  });

  it('Windows-1251 → UTF-8 с BOM', () => {
    const win1251 = Buffer.from([0xd1, 0xec, 0xe5, 0xf2, 0xe0]); // «Смета»
    const out = normalizeTextForOffice(win1251);
    expect(out.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    expect(out.subarray(3).toString('utf-8')).toBe('Смета');
  });

  it('чистый ASCII → BOM + байты', () => {
    const out = normalizeTextForOffice(Buffer.from('111', 'ascii'));
    expect(out.toString('utf-8')).toBe('\uFEFF111');
  });

  it('бинарные данные под .txt (нулевой байт) — не трогаем', () => {
    const bin = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    expect(normalizeTextForOffice(bin).equals(bin)).toBe(true);
  });
});
