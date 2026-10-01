import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { homeSummarySchema, type HomeSummary } from '@nodus/contracts';

import { GetUser } from '../../core/decorators/get-user.decorator.js';
import type { AuthUser } from '@nodus/contracts';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { HomeService } from './home.service.js';

/**
 * Витрина Главной (#100): агрегат `GET /home/summary` — метрики компании,
 * дни рождения, заделы трудозатрат. Читает только реальные данные; модуль
 * ядровой (отключаемости флагом не имеет — Главная есть всегда, I10),
 * источники отсутствующих метрик появятся со своими модулями.
 */
@ApiTags('home')
@ApiBearerAuth()
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Витрина Главной: метрики компании и дни рождения' })
  @ApiOkResponse({ standardSchema: homeSummarySchema })
  @ApiErrors(401)
  getSummary(@GetUser() user: AuthUser): Promise<HomeSummary> {
    void user; // авторизация глобальной гвардией; строка — общая для компании
    return this.home.getSummary();
  }
}
