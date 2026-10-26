// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMAIL_SANDBOX, SandboxedHtml } from './sandboxed-html.js';

afterEach(cleanup);

const HTML = '<p>Письмо</p><img src="https://cdn.example/a.png" alt="">';

describe('SandboxedHtml (#55, Р9)', () => {
  it('точный sandbox, no-referrer и CSP без внешнего в srcdoc', () => {
    const onBlocked = vi.fn();
    const { container } = render(
      <SandboxedHtml
        html={HTML}
        allowRemoteImages={false}
        onBlockedImages={onBlocked}
        title="Текст письма"
      />,
    );
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe(EMAIL_SANDBOX);
    expect(EMAIL_SANDBOX).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('title')).toBe('Текст письма');
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain(
      `content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:"`,
    );
    expect(srcdoc).not.toContain('https://cdn.example/a.png');
    expect(onBlocked).toHaveBeenCalledWith(1);
  });

  it('«Показать изображения» добавляет https: в img-src и саму картинку', () => {
    const { container } = render(
      <SandboxedHtml html={HTML} allowRemoteImages title="Текст письма" />,
    );
    const srcdoc = container.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('img-src data: cid: https:;');
    expect(srcdoc).toContain('https://cdn.example/a.png');
  });
});
