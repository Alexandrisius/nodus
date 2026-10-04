import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  notificationDeliverySchema,
  notificationPageSchema,
  notificationSchema,
  notificationSettingsSchema,
  notificationSummarySchema,
  updateNotificationSettingsBodySchema,
  urgentAckStatusSchema,
  listNotificationsQuerySchema,
  type ListNotificationsQuery,
  type Notification,
  type NotificationDelivery,
  type NotificationPage,
  type NotificationSettings,
  type NotificationSummary,
  type UpdateNotificationSettingsBody,
  type UrgentAckStatus,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../core/decorators/require-feature.decorator.js';
import type { AuthUser } from '@nodus/contracts';
import { ApiErrors } from '../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';

const uuidSchema = z.uuid();

/**
 * Журнал уведомлений (`/api/v1/notifications`, #100): лента Главной,
 * сводка бейджей, прочтение одного, ознакомление, статус ознакомившихся,
 * настройки DND. Доступ — только свои строки (RBAC на уровне запросов:
 * чужие id = NOT_FOUND, G3).
 */
@ApiTags('notifications')
@ApiBearerAuth()
@RequireFeature('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Лента журнала (фильтры пилюль, поиск, дельта afterSeq)' })
  @ApiOkResponse({ standardSchema: notificationPageSchema })
  @ApiErrors(400, 401, 404)
  list(
    @GetUser() user: AuthUser,
    @Query({
      schema: listNotificationsQuerySchema,
      pipes: [new ZodValidationPipe(listNotificationsQuerySchema)],
    })
    query: ListNotificationsQuery,
  ): Promise<NotificationPage> {
    return this.service.list(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Сводка «число + точка» для индикации' })
  @ApiOkResponse({ standardSchema: notificationSummarySchema })
  @ApiErrors(401, 404)
  summary(@GetUser() user: AuthUser): Promise<NotificationSummary> {
    return this.service.summary(user.id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Настройки уведомлений (DND-расписание)' })
  @ApiOkResponse({ standardSchema: notificationSettingsSchema })
  @ApiErrors(401, 404)
  settings(@GetUser() user: AuthUser): Promise<NotificationSettings> {
    return this.service.settings(user.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Правка настроек (частичный патч)' })
  @ApiOkResponse({ standardSchema: notificationSettingsSchema })
  @ApiErrors(400, 401, 404)
  @ApiIdempotencyKey()
  @Audit({ action: 'notification.update_settings', entity: 'notification' })
  updateSettings(
    @GetUser() user: AuthUser,
    @Body({
      schema: updateNotificationSettingsBodySchema,
      pipes: [new ZodValidationPipe(updateNotificationSettingsBodySchema)],
    })
    patch: UpdateNotificationSettingsBody,
  ): Promise<NotificationSettings> {
    return this.service.updateSettings(user.id, patch);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Прочитать одно (открытие деталей; срочное — только ознакомлением)' })
  @ApiOkResponse({ standardSchema: notificationSchema })
  @ApiErrors(400, 401, 404, 409)
  @ApiIdempotencyKey()
  @Audit({ action: 'notification.read', entity: 'notification' })
  readOne(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Notification> {
    return this.service.readOne(user.id, id);
  }

  @Get('urgent/:messageId/acks')
  @ApiOperation({ summary: '«Ознакомились N из M» по срочному (только отправитель)' })
  @ApiOkResponse({ standardSchema: urgentAckStatusSchema })
  @ApiErrors(401, 404)
  urgentAcks(
    @GetUser() user: AuthUser,
    @Param('messageId', new ZodValidationPipe(uuidSchema)) messageId: string,
  ): Promise<UrgentAckStatus> {
    return this.service.urgentAcks(user.id, messageId);
  }

  @Post(':id/ack')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ознакомиться со срочным (СЭД-паттерн, только urgent)' })
  @ApiOkResponse({ standardSchema: notificationSchema })
  @ApiErrors(400, 401, 404)
  @ApiIdempotencyKey()
  @Audit({ action: 'notification.ack', entity: 'notification' })
  ack(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Notification> {
    return this.service.ack(user.id, id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Журнал доставок уведомления (когда и каким каналом)' })
  @ApiOkResponse({
    standardSchema: z.object({ items: z.array(notificationDeliverySchema) }),
  })
  @ApiErrors(401, 404)
  deliveries(
    @GetUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<{ items: NotificationDelivery[] }> {
    return this.service.deliveries(user.id, id).then((items) => ({ items }));
  }
}
