import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { CustomFieldDefinition, CustomFieldValues } from '@nodus/contracts';
import { customFieldValueSchemaOf } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  ORG_STRUCTURE_READER,
  type OrgStructureReader,
} from '../../../core/ports/org-structure.port.js';

/**
 * Значения по умолчанию при создании сущности (#431, Р5): статическое
 * значение и «подразделение автора» (снимок на момент создания — не
 * пересчитывается при переводе сотрудника). Подставляются только
 * отсутствующие ключи: явное значение важнее.
 *
 * Невалидное умолчание (ссылка стала неактивной, тип разошёлся) тихо
 * пропускается с warn в лог — создание сущности не ломается. Отбрасывание
 * делает вызывающий (`CustomFieldRegistry.prepareCreate`) через валидатор:
 * здесь только сборка кандидатов.
 */
@Injectable()
export class CustomFieldDefaults {
  constructor(
    @Inject(ORG_STRUCTURE_READER) private readonly org: OrgStructureReader,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomFieldDefaults.name);
  }

  async resolve(
    definitions: readonly CustomFieldDefinition[],
    authorId: string,
    tx?: TransactionClient,
  ): Promise<CustomFieldValues> {
    const withDefaults = definitions.filter((definition) => definition.defaultValue !== null);
    if (withDefaults.length === 0) return {};

    let authorDepartment: string | null | undefined;
    const values: CustomFieldValues = {};
    for (const definition of withDefaults) {
      const defaultValue = definition.defaultValue!;
      if (defaultValue.kind === 'author_department') {
        authorDepartment ??= await this.org.departmentOf(authorId, tx);
        if (authorDepartment) values[definition.id] = authorDepartment;
        else
          this.logger.debug(
            { definitionId: definition.id },
            'Автор без подразделения — умолчание пропущено',
          );
        continue;
      }
      if (customFieldValueSchemaOf(definition).safeParse(defaultValue.value).success) {
        values[definition.id] = defaultValue.value;
      } else {
        this.logger.warn(
          { definitionId: definition.id },
          'Умолчание не соответствует типу атрибута — пропущено',
        );
      }
    }
    return values;
  }
}
