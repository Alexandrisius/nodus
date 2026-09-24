import { describe, expect, it } from 'vitest';

import { MAX_FILES_PER_MESSAGE, validateFiles } from './upload-attachment.js';

/** File нужного «размера» без мегабайтов в памяти: size — геттер прототипа,
 *  переопределяем на инстансе (валидация читает только его). */
const file = (name: string, size: number): File => {
  const f = new File(['x'], name, { type: 'image/png' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('validateFiles — лимиты вложений ДО старта загрузки (вердикт 24.09)', () => {
  it('обычные файлы принимаются целиком', () => {
    const { accepted, issue } = validateFiles([file('a.png', 10), file('b.png', 20)], 0);
    expect(issue).toBeNull();
    expect(accepted).toHaveLength(2);
  });

  it('превышение размера 100 МБ — too-large, принятые до него остаются', () => {
    const big = file('big.png', 100 * 1024 * 1024 + 1);
    const { accepted, issue } = validateFiles([file('ok.png', 10), big], 0);
    expect(issue).toBe('too-large');
    expect(accepted).toHaveLength(1);
  });

  it('ровно 100 МБ — ещё валидно (граница включительная)', () => {
    expect(validateFiles([file('edge.png', 100 * 1024 * 1024)], 0).issue).toBeNull();
  });

  it('с учётом уже ожидающих в трее — too-many на 21-м', () => {
    const incoming = Array.from({ length: 5 }, (_, i) => file(`f${i}.png`, 10));
    const { accepted, issue } = validateFiles(incoming, MAX_FILES_PER_MESSAGE - 3);
    expect(issue).toBe('too-many');
    expect(accepted).toHaveLength(3);
  });
});
