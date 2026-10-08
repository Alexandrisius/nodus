import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { desktopConfigSchema, type DesktopConfig } from '@nodus/contracts';

import { Public } from '../../core/decorators/public.decorator.js';

/**
 * Конфиг десктоп-оболочки (ADR-0019): идентификация сервера на экране
 * подключения и минимальная поддерживаемая версия оболочки. Публичный —
 * оболочка спрашивает его до входа пользователя; чтение, кэшировать можно.
 */
@Public()
@ApiTags('desktop')
@Controller('desktop')
export class DesktopConfigController {
  @Get('config')
  @ApiOperation({ summary: 'Конфиг оболочки: имя сервера и минимальная версия (публичный)' })
  @ApiOkResponse({ standardSchema: desktopConfigSchema })
  getConfig(): DesktopConfig {
    // zod-валидация на границе (I7); env читается напрямую по канону модулей.
    return desktopConfigSchema.parse({
      serverName: process.env.NODUS_SERVER_NAME?.trim() || 'Nodus',
      minShellVersion: process.env.NODUS_MIN_SHELL_VERSION?.trim() || '0.0.0',
    });
  }
}
