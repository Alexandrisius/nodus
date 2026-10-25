import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  Permission,
  addContactPersonBodySchema,
  contactPersonSchema,
  updateContactPersonBodySchema,
  type AddContactPersonBody,
  type AuthUser,
  type ContactPerson,
  type UpdateContactPersonBody,
} from '@nodus/contracts';

import { Audit } from '../../../core/decorators/audit.decorator.js';
import { GetUser } from '../../../core/decorators/get-user.decorator.js';
import { RequireFeature } from '../../../core/decorators/require-feature.decorator.js';
import { RequirePermissions } from '../../../core/decorators/require-permissions.decorator.js';
import { ApiErrors } from '../../../core/openapi/api-errors.decorator.js';
import { ApiIdempotencyKey } from '../../../core/openapi/api-idempotency.decorator.js';
import { ZodValidationPipe } from '../../../core/pipes/zod-validation.pipe.js';
import { ContactsService } from './contacts.service.js';

const idParamSchema = z.uuid();

/**
 * Контактные лица контрагента (`/api/v1/counterparties/:counterpartyId/contacts`).
 * Отдельный контроллер — база пути с параметром: дублей статических путей
 * с `CounterpartiesController` нет (gotcha FST_ERR_DUPLICATED_ROUTE).
 * Добавление — `crm.create`, правка и архив — `crm.manage` (I8).
 */
@ApiTags('crm')
@ApiBearerAuth()
@RequireFeature('crm')
@Controller('counterparties/:counterpartyId/contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  @RequirePermissions(Permission.CRM_CREATE)
  @Audit({ action: 'crm.contact_add', entity: 'contact_person' })
  @ApiOperation({ summary: 'Добавить контактное лицо контрагента' })
  @ApiParam({
    name: 'counterpartyId',
    description: 'UUID контрагента',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiCreatedResponse({ standardSchema: contactPersonSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  add(
    @Param('counterpartyId', new ZodValidationPipe(idParamSchema)) counterpartyId: string,
    @Body({
      schema: addContactPersonBodySchema,
      pipes: [new ZodValidationPipe(addContactPersonBodySchema)],
    })
    dto: AddContactPersonBody,
    @GetUser() actor: AuthUser,
  ): Promise<ContactPerson> {
    return this.contacts.add(counterpartyId, dto, actor.id);
  }

  @Patch(':contactId')
  @RequirePermissions(Permission.CRM_MANAGE)
  @Audit({ action: 'crm.contact_update', entity: 'contact_person' })
  @ApiOperation({ summary: 'Правка контактного лица (частичная)' })
  @ApiParam({
    name: 'counterpartyId',
    description: 'UUID контрагента',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({
    name: 'contactId',
    description: 'UUID контактного лица',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: contactPersonSchema })
  @ApiErrors(400, 401, 403, 404, 409)
  @ApiIdempotencyKey()
  update(
    @Param('counterpartyId', new ZodValidationPipe(idParamSchema)) counterpartyId: string,
    @Param('contactId', new ZodValidationPipe(idParamSchema)) contactId: string,
    @Body({
      schema: updateContactPersonBodySchema,
      pipes: [new ZodValidationPipe(updateContactPersonBodySchema)],
    })
    dto: UpdateContactPersonBody,
    @GetUser() actor: AuthUser,
  ): Promise<ContactPerson> {
    return this.contacts.update(counterpartyId, contactId, dto, actor.id);
  }

  @Post(':contactId/archive')
  @HttpCode(200)
  @RequirePermissions(Permission.CRM_MANAGE)
  @Audit({ action: 'crm.contact_archive', entity: 'contact_person' })
  @ApiOperation({ summary: 'Перенести контактное лицо в архив' })
  @ApiParam({
    name: 'counterpartyId',
    description: 'UUID контрагента',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({
    name: 'contactId',
    description: 'UUID контактного лица',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: contactPersonSchema })
  @ApiErrors(401, 403, 404, 409)
  @ApiIdempotencyKey()
  archive(
    @Param('counterpartyId', new ZodValidationPipe(idParamSchema)) counterpartyId: string,
    @Param('contactId', new ZodValidationPipe(idParamSchema)) contactId: string,
    @GetUser() actor: AuthUser,
  ): Promise<ContactPerson> {
    return this.contacts.setArchived(counterpartyId, contactId, true, actor.id);
  }

  @Post(':contactId/restore')
  @HttpCode(200)
  @RequirePermissions(Permission.CRM_MANAGE)
  @Audit({ action: 'crm.contact_restore', entity: 'contact_person' })
  @ApiOperation({ summary: 'Вернуть контактное лицо из архива' })
  @ApiParam({
    name: 'counterpartyId',
    description: 'UUID контрагента',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({
    name: 'contactId',
    description: 'UUID контактного лица',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ standardSchema: contactPersonSchema })
  @ApiErrors(401, 403, 404, 409)
  @ApiIdempotencyKey()
  restore(
    @Param('counterpartyId', new ZodValidationPipe(idParamSchema)) counterpartyId: string,
    @Param('contactId', new ZodValidationPipe(idParamSchema)) contactId: string,
    @GetUser() actor: AuthUser,
  ): Promise<ContactPerson> {
    return this.contacts.setArchived(counterpartyId, contactId, false, actor.id);
  }
}
