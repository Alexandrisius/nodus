import { describe, expect, it } from 'vitest';

import { DesktopConfigController } from './desktop-config.controller.js';

describe('DesktopConfigController', () => {
  it('GET /desktop/config отдаёт дефолты без env', () => {
    const controller = new DesktopConfigController();
    expect(controller.getConfig()).toEqual({
      serverName: 'Nodus',
      minShellVersion: '0.0.0',
    });
  });

  it('читает NODUS_SERVER_NAME / NODUS_MIN_SHELL_VERSION из окружения', () => {
    process.env.NODUS_SERVER_NAME = 'СтройИнвест портал';
    process.env.NODUS_MIN_SHELL_VERSION = '1.2.0';
    try {
      const controller = new DesktopConfigController();
      expect(controller.getConfig()).toEqual({
        serverName: 'СтройИнвест портал',
        minShellVersion: '1.2.0',
      });
    } finally {
      delete process.env.NODUS_SERVER_NAME;
      delete process.env.NODUS_MIN_SHELL_VERSION;
    }
  });

  it('пустой env падает обратно на дефолты (не на ошибку валидации)', () => {
    process.env.NODUS_SERVER_NAME = '   ';
    try {
      const controller = new DesktopConfigController();
      expect(controller.getConfig().serverName).toBe('Nodus');
    } finally {
      delete process.env.NODUS_SERVER_NAME;
    }
  });
});
