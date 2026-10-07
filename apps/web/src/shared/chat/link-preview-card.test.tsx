// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LinkPreview } from '@nodus/contracts';

import { linkCardVisible, MessageLinkPreview } from './link-preview-card.js';

const preview = (over: Partial<LinkPreview>): LinkPreview => ({
  siteName: null,
  title: null,
  description: null,
  imageUrl: null,
  status: 'ready',
  ...over,
});

/** Видимость карточки превью (#240, вердикт 07.10): ссылка без превью-данных
 *  не рисует карточку-заглушку — паритет Telegram, остаётся текст ссылки. */
describe('linkCardVisible (#240)', () => {
  it('нет http(s)-ссылки в тексте — карточки нет', () => {
    expect(linkCardVisible('просто текст', preview({ title: 'T' }))).toBe(false);
  });

  it('pending/null — скелетон виден (конвейер фоновый, WS дозреет)', () => {
    expect(linkCardVisible('см. https://example.com', null)).toBe(true);
    expect(linkCardVisible('см. https://example.com', preview({ status: 'pending' }))).toBe(true);
  });

  it('дозревшая БЕЗ заголовка/описания/картинки — НЕ видна (заглушки отменены)', () => {
    expect(linkCardVisible('https://example.com', preview({}))).toBe(false);
    expect(linkCardVisible('https://example.com', preview({ status: 'failed' }))).toBe(false);
    expect(linkCardVisible('https://example.com', preview({ status: 'blocked' }))).toBe(false);
  });

  it('есть любой контент — видна', () => {
    expect(linkCardVisible('https://example.com', preview({ title: 'T' }))).toBe(true);
    expect(linkCardVisible('https://example.com', preview({ description: 'D' }))).toBe(true);
    expect(linkCardVisible('https://example.com', preview({ imageUrl: '/x.webp' }))).toBe(true);
  });
});

describe('MessageLinkPreview (#240)', () => {
  afterEach(cleanup);

  it('failed без OG-данных — карточка не рендерится вовсе', () => {
    const { container } = render(
      <MessageLinkPreview text="https://example.com" preview={preview({ status: 'failed' })} />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('ready без контента — тоже пусто (никаких заглушек из домена)', () => {
    const { container } = render(
      <MessageLinkPreview text="https://example.com" preview={preview({})} />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('pending — скелетон-карточка на месте', () => {
    const { container } = render(
      <MessageLinkPreview text="https://example.com" preview={preview({ status: 'pending' })} />,
    );
    expect(container.querySelector('a')).not.toBeNull();
  });

  it('ready с заголовком — карточка с доменом и заголовком', () => {
    render(
      <MessageLinkPreview text="https://example.com" preview={preview({ title: 'Заголовок' })} />,
    );
    expect(screen.getByText('example.com')).toBeTruthy();
    expect(screen.getByText('Заголовок')).toBeTruthy();
  });
});
