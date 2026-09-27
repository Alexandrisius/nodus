import { describe, expect, it } from 'vitest';

import { messageSurface } from './message-surface.js';

/**
 * Единая поверхность сообщения (#127): все хосты рендера (пузырь чата, корень
 * треда, карточка поста канала, обсуждение задачи) берут заливку и акценты
 * ТОЛЬКО отсюда — посты не могут быть «пузырями другого цвета» (вердикт
 * владельца 28.09.2026). Тест фиксирует состав решения, чтобы правка палитры
 * не разъезжалась по хостам.
 */
describe('messageSurface — единое решение заливки сообщения (#127)', () => {
  it('своё сообщение — залитая поверхность bubble-out и её акцент', () => {
    const s = messageSurface(true);
    expect(s.fill).toContain('bg-bubble-out');
    expect(s.fill).toContain('text-bubble-out-foreground');
    expect(s.accentText).toBe('text-bubble-out-accent');
    expect(s.accentBg).toBe('bg-bubble-out-accent');
    expect(s.ring).toBe('ring-bubble-out');
    expect(s.onFilled).toBe(true);
  });

  it('чужое сообщение — светлая поверхность bubble-in и info-акцент', () => {
    const s = messageSurface(false);
    expect(s.fill).toContain('bg-bubble-in');
    expect(s.fill).toContain('text-bubble-in-foreground');
    expect(s.accentText).toBe('text-info');
    expect(s.accentBg).toBe('bg-info');
    expect(s.ring).toBe('ring-bubble-in');
    expect(s.onFilled).toBe(false);
  });

  it('никаких глобальных primary/card в решении поверхности (урок #127)', () => {
    for (const s of [messageSurface(true), messageSurface(false)]) {
      expect(s.fill).not.toMatch(/primary|card/);
    }
  });
});
