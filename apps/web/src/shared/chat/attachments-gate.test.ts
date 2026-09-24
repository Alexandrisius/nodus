import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseApiMockEnv } from '../api/api-mock-config.js';
import { chatAttachmentsEnabled } from './attachments-gate.js';

/** Гейт вложений (вердикт 25.09): вложения доступны ТОЛЬКО когда домен chat
 *  мокается (демо-сборка, частичный список с chat); в живом режиме и без
 *  MSW — выключены, в частичном списке без chat — выключены. */
describe('attachments-gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('живой режим (VITE_API_MOCK пуст/false) — вложения выключены', () => {
    vi.stubEnv('VITE_API_MOCK', '');
    expect(chatAttachmentsEnabled()).toBe(false);
    vi.stubEnv('VITE_API_MOCK', 'false');
    expect(chatAttachmentsEnabled()).toBe(false);
  });

  it('демо (true) — вложения работают', () => {
    vi.stubEnv('VITE_API_MOCK', 'true');
    expect(chatAttachmentsEnabled()).toBe(true);
  });

  it('частичный список моков: chat в списке — работают, без chat — выключены', () => {
    vi.stubEnv('VITE_API_MOCK', 'auth,chat');
    expect(chatAttachmentsEnabled()).toBe(true);
    vi.stubEnv('VITE_API_MOCK', 'auth,tasks');
    expect(chatAttachmentsEnabled()).toBe(false);
  });

  it('парсерenv: неизвестные домены игнорируются, регистр не важен', () => {
    expect(parseApiMockEnv('CHAT').domains).toEqual(new Set(['chat']));
    expect(parseApiMockEnv('auth,unknown').domains).toEqual(new Set(['auth']));
  });
});
