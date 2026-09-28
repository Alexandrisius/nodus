// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageTombstone } from './tombstone.js';

/** Надгробие (#132): data-slot обязателен — правило примитива
 *  group-data-[align=end]/message:*:data-slot:self-end прижимает к правому
 *  краю в two-sided только детей с data-slot (баг «всегда слева»). */
afterEach(cleanup);

describe('MessageTombstone', () => {
  it('несёт data-slot для align-правила примитива', () => {
    const { container } = render(<MessageTombstone mine />);
    const el = container.querySelector('[data-slot="message-tombstone"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Вы удалили это сообщение');
  });
});
