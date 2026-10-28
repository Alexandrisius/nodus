// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMAIL_SANDBOX, SandboxedHtml } from './sandboxed-html.js';

afterEach(cleanup);

const HTML = '<p>Письмо</p><img src="https://cdn.example/a.png" alt="">';

describe('SandboxedHtml (#55, Р9; cid — #56, Р11)', () => {
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
    // 'self' — резолвнутые cid-картинки (подписанные ссылки того же
    // происхождения, #56); https — только по кнопке.
    expect(srcdoc).toContain(
      `content="default-src 'none'; img-src 'self' data: cid:; style-src 'unsafe-inline'; font-src data:"`,
    );
    expect(srcdoc).not.toContain('https://cdn.example/a.png');
    expect(onBlocked).toHaveBeenCalledWith(1);
  });

  it('«Показать изображения» добавляет https: в img-src и саму картинку', () => {
    const { container } = render(
      <SandboxedHtml html={HTML} allowRemoteImages title="Текст письма" />,
    );
    const srcdoc = container.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain("img-src 'self' data: cid: https:;");
    expect(srcdoc).toContain('https://cdn.example/a.png');
  });

  it('знакомый cid подменяется абсолютным URL вложения, чужой — остаётся', () => {
    const html =
      '<p>КП</p><img src="cid:logo@psm-partner" alt="лого"><img src="cid:unknown@x" alt="чужой">';
    const cidMap = { 'logo@psm-partner': 'https://portal.nodus.by/api/v1/files/x/content?sig=1' };
    const { container } = render(
      <SandboxedHtml html={html} allowRemoteImages={false} cidMap={cidMap} title="Текст письма" />,
    );
    const srcdoc = container.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('src="https://portal.nodus.by/api/v1/files/x/content?sig=1"');
    // Незнакомый contentId не подменяется — сломанная картинка, безопасно.
    expect(srcdoc).toContain('src="cid:unknown@x"');
  });
});
