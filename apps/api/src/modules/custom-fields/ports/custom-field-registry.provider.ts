import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  CustomFieldDefinition,
  CustomFieldRef,
  CustomFieldScope,
  CustomFieldValue,
  CustomFieldValues,
} from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { DefinitionMapper } from '../definitions/definition.mapper.js';
import { DefinitionsRepository } from '../definitions/definitions.repository.js';
import { CustomFieldDefaults } from '../values/defaults.js';
import { CustomFieldRefsHydrator } from '../values/refs-hydrator.js';
import { CustomFieldValueValidator, type CustomFieldIssue } from '../values/value-validator.js';
import type {
  CustomFieldRegistry,
  PrepareCreateArgs,
  PrepareUpdateArgs,
  RegistryFieldChange,
} from './custom-field-registry.port.js';

/**
 * Реализация порта реестра атрибутов (#431, Р2): единственная точка
 * динамической валидации значений и умолчаний. Определения читаются без
 * кэша (≤ 100 строк области, один запрос на операцию).
 *
 * Каноническое сравнение значений — по стабильной строке: PostgreSQL
 * переставляет ключи JSONB, а `{amount, currencyId}` и `{currencyId, amount}`
 * — одно значение (gotcha «jsonb переставляет ключи»).
 */
@Injectable()
export class CustomFieldRegistryProvider implements CustomFieldRegistry {
  constructor(
    private readonly repository: DefinitionsRepository,
    private readonly mapper: DefinitionMapper,
    private readonly validator: CustomFieldValueValidator,
    private readonly defaults: CustomFieldDefaults,
    private readonly hydrator: CustomFieldRefsHydrator,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CustomFieldRegistryProvider.name);
  }

  async definitions(
    scope: CustomFieldScope,
    tx?: TransactionClient,
  ): Promise<CustomFieldDefinition[]> {
    const rows = await this.repository.list(scope, tx);
    return this.mapper.toDtos(rows, tx);
  }

  async prepareCreate(
    scope: CustomFieldScope,
    args: PrepareCreateArgs,
    tx?: TransactionClient,
  ): Promise<CustomFieldValues> {
    const definitions = await this.definitions(scope, tx);
    if (definitions.length === 0) {
      assertNoInput(args.input);
      return {};
    }

    const candidates = await this.defaults.resolve(definitions, args.authorId, tx);
    const defaultIssues = await this.validator.validate(scope, definitions, candidates, tx);
    const cleanDefaults = dropIssues(candidates, defaultIssues);
    if (defaultIssues.length > 0) {
      this.logger.warn(
        { scope, fieldIds: defaultIssues.map((issue) => issue.fieldId) },
        'Умолчания атрибутов пропущены: ссылки недействительны',
      );
    }

    const issues = await this.validator.validate(scope, definitions, args.input, tx);
    if (issues.length > 0) throw invalidValues(issues);
    return { ...cleanDefaults, ...args.input };
  }

  async prepareUpdate(
    scope: CustomFieldScope,
    args: PrepareUpdateArgs,
    tx?: TransactionClient,
  ): Promise<{ next: CustomFieldValues; changes: RegistryFieldChange[] }> {
    const changed: CustomFieldValues = {};
    for (const [fieldId, value] of Object.entries(args.patch)) {
      if (value === null) continue;
      if (canonical(args.current[fieldId]) !== canonical(value)) changed[fieldId] = value;
    }

    const definitions = await this.definitions(scope, tx);
    const issues = await this.validator.validate(scope, definitions, changed, tx);
    if (issues.length > 0) throw invalidValues(issues);

    const next: CustomFieldValues = { ...args.current };
    const changes: RegistryFieldChange[] = [];
    for (const [fieldId, value] of Object.entries(args.patch)) {
      const before = (args.current[fieldId] ?? null) as CustomFieldValue | null;
      if (value === null) {
        if (before === null) continue;
        delete next[fieldId];
        changes.push({ fieldId, from: before, to: null });
        continue;
      }
      if (canonical(before) === canonical(value)) continue;
      next[fieldId] = value;
      changes.push({ fieldId, from: before, to: value });
    }
    return { next, changes };
  }

  async refs(
    scope: CustomFieldScope,
    values: CustomFieldValues,
    tx?: TransactionClient,
  ): Promise<CustomFieldRef[]> {
    if (Object.keys(values).length === 0) return [];
    const definitions = await this.definitions(scope, tx);
    return this.hydrator.hydrate(definitions, values, tx);
  }
}

/** Пустой ввод при отсутствии определений области — это «чужой ключ». */
function assertNoInput(input: CustomFieldValues): void {
  const keys = Object.keys(input);
  if (keys.length === 0) return;
  throw invalidValues(
    keys.map((fieldId) => ({
      fieldId,
      reason: 'unknown' as const,
      message: 'Unknown custom field',
    })),
  );
}

/** Значения без полей, отвергнутых валидатором (умолчания). */
function dropIssues(
  values: CustomFieldValues,
  issues: readonly CustomFieldIssue[],
): CustomFieldValues {
  if (issues.length === 0) return values;
  const rejected = new Set(issues.map((issue) => issue.fieldId));
  return Object.fromEntries(Object.entries(values).filter(([fieldId]) => !rejected.has(fieldId)));
}

/** 422 с перечнем полей (Р2): `details.issues[] = {fieldId, reason, message}`. */
export function invalidValues(issues: readonly CustomFieldIssue[]): DomainException {
  return new DomainException(
    ErrorCode.CUSTOM_FIELD_VALUE_INVALID,
    'Custom field value is invalid',
    { issues },
  );
}

/** Стабильная строка значения: ключи объектов сортируются. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${key}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
