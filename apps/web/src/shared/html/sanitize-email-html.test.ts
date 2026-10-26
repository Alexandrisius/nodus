// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { BLOCKED_IMAGE_SRC, sanitizeEmailHtml } from './sanitize-email-html.js';

const DIRTY = `<!doctype html><html><head>
<meta http-equiv="refresh" content="0; url=https://phishing.example">
<link rel="stylesheet" href="https://cdn.example/x.css">
<base href="https://evil.example/">
<style>.hero{color:#123}</style>
<script>alert(1)</script>
</head><body onload="alert(2)">
<p class="hero">Здравствуйте</p>
<img src="https://cdn.example/banner.jpg" srcset="https://cdn.example/b2.jpg 2x" width="640" alt="Баннер">
<img src="http://tracker.example/open.gif" width="1" height="1" alt="">
<img src="data:image/png;base64,iVBORw0KGgo=" alt="Логотип">
<img src="cid:logo@mail" alt="Вложение">
<img src="x" onerror="alert(3)" alt="">
<a href="https://ok.example/meeting">совещание</a>
<a href="javascript:alert(4)">ловушка</a>
<a href="mailto:m@ok.example">почта</a>
<form action="https://phishing.example"><input name="password"><button>Отправить</button></form>
<iframe src="https://ok.example/embed"></iframe>
<table background="https://cdn.example/bg.png"><tr><td>ячейка</td></tr></table>
</body></html>`;

describe('sanitizeEmailHtml (#55, Р9)', () => {
  it('снимает script, on*, javascript:, meta/link/base, формы и фреймы', () => {
    const { html } = sanitizeEmailHtml(DIRTY, { allowRemoteImages: false });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror|onload/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<meta|<link|<base/i);
    expect(html).not.toMatch(/<form|<input|<button|<iframe/i);
    expect(html).toContain('ловушка');
  });

  it('режет внешние картинки (заглушка + счётчик), оставляет data: и cid:', () => {
    const { html, blockedImages } = sanitizeEmailHtml(DIRTY, { allowRemoteImages: false });
    expect(blockedImages).toBe(3);
    expect(html).not.toContain('cdn.example/banner.jpg');
    expect(html).not.toContain('srcset');
    expect(html).not.toContain('bg.png');
    expect(html).toContain(BLOCKED_IMAGE_SRC);
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('cid:logo@mail');
  });

  it('«Показать изображения» пропускает только https', () => {
    const { html, blockedImages } = sanitizeEmailHtml(DIRTY, { allowRemoteImages: true });
    expect(html).toContain('https://cdn.example/banner.jpg');
    expect(html).not.toContain('http://tracker.example');
    expect(blockedImages).toBe(1);
  });

  it('ссылки открываются новой вкладкой без доступа к порталу; стили письма сохраняются', () => {
    const { html } = sanitizeEmailHtml(DIRTY, { allowRemoteImages: false });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a[href]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://ok.example/meeting',
      'mailto:m@ok.example',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(html).toContain('.hero{color:#123}');
  });
});
