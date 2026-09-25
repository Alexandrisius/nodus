import { describe, expect, it } from 'vitest';

import { MENTION_TOKENS_MAX, parseMentionTokens } from './mentions.js';

/** @упоминания (раунд 3): парсер токенов — соответствие имени решает
 *  справочник (порт), здесь только извлечение «@Имя» из текста. */

describe('parseMentionTokens', () => {
  it('извлекает токены без «@», уникально, в порядке появления', () => {
    expect(parseMentionTokens('привет @Анна, потом @Анна и @boris.k')).toEqual(['Анна', 'boris.k']);
  });

  it('кириллица, латиница, цифры, точки/дефисы/подчёркивания', () => {
    expect(parseMentionTokens('@Иван @user_1 @О-Ковальчук')).toEqual([
      'Иван',
      'user_1',
      'О-Ковальчук',
    ]);
  });

  it('email и «собака» без имени не являются упоминаниями', () => {
    expect(parseMentionTokens('напиши на a@b.by и @')).toEqual([]);
  });

  it('лимит токенов на сообщение', () => {
    const text = Array.from({ length: MENTION_TOKENS_MAX + 10 }, (_, i) => `@u${i}`).join(' ');
    expect(parseMentionTokens(text)).toHaveLength(MENTION_TOKENS_MAX);
  });

  it('пустой текст — пусто', () => {
    expect(parseMentionTokens('')).toEqual([]);
  });
});
