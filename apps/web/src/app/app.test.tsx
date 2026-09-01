import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('рендерит название портала', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Nodus');
  });
});
