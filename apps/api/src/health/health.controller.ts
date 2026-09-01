import { Controller, Get } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@nodus/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    // zod-валидация на границе (I7): ответ наружу всегда соответствует контракту.
    return healthResponseSchema.parse({ status: 'ok', timestamp: new Date().toISOString() });
  }
}
