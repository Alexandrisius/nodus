// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { setShellVisibleFromShell } from './desktop-bridge.js';
import { flushOnShellHidden, registerShellHiddenFlush } from './shell-hidden.js';

describe('shell-hidden (сокрытие оболочки)', () => {
  it('флашит все живые планировщики; снятая регистрация не вызывается', () => {
    const conversation = vi.fn();
    const thread = vi.fn();
    const offConversation = registerShellHiddenFlush(conversation);
    const offThread = registerShellHiddenFlush(thread);

    flushOnShellHidden();
    expect(conversation).toHaveBeenCalledTimes(1);
    expect(thread).toHaveBeenCalledTimes(1);

    offThread();
    flushOnShellHidden();
    expect(conversation).toHaveBeenCalledTimes(2);
    expect(thread).toHaveBeenCalledTimes(1);

    offConversation();
    flushOnShellHidden();
    expect(conversation).toHaveBeenCalledTimes(2);
  });

  it('скрытие оболочки флашит СИНХРОННО — без ленивого import (#358: teardown-флейк CI)', () => {
    const flush = vi.fn();
    const off = registerShellHiddenFlush(flush);
    setShellVisibleFromShell(false);
    expect(flush).toHaveBeenCalledTimes(1);
    setShellVisibleFromShell(true);
    expect(flush).toHaveBeenCalledTimes(1);
    off();
  });
});
