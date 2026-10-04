import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { urgentPolicySchema, type UrgentPolicy } from '@nodus/contracts';

import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { UrgentPolicyReader } from './urgent-policy.reader.js';

/**
 * Политика важных сообщений (`/api/v1/chat/urgent`, #177): состояние
 * дневного лимита отправителя для счётчика в попапе молнии. Только чтение —
 * резервирования лимита нет, истина при отправке проверяется политикой send.
 */
@ApiTags('chat')
@ApiBearerAuth()
@RequireFeature('chat')
@Controller('chat/urgent')
export class UrgentPolicyController {
  constructor(private readonly policy: UrgentPolicyReader) {}

  @Get('policy')
  @ApiOperation({
    summary: 'Дневной лимит важных: remaining/limit/resetAt (скользящие сутки) и groupMax',
  })
  @ApiOkResponse({ standardSchema: urgentPolicySchema })
  @ApiErrors(401)
  read(@GetUser() user: { id: string }): Promise<UrgentPolicy> {
    return this.policy.read(user.id);
  }
}
