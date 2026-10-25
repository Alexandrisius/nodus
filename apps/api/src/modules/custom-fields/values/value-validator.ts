import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomFieldDefinition,
  CustomFieldScope,
  CustomFieldValue,
  CustomFieldValues,
} from '@nodus/contracts';
import { customFieldValueSchemaOf, CUSTOM_FIELD_LIMITS } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  ORG_STRUCTURE_READER,
  type OrgStructureReader,
} from '../../../core/ports/org-structure.port.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import {
  COUNTERPARTY_READER,
  type CounterpartyReader,
} from '../../crm/ports/counterparty-reader.port.js';
import {
  DICTIONARY_READER,
  type DictionaryReader,
} from '../../dictionaries/ports/dictionary-reader.port.js';

/** Что валидатору нужно знать об определении (DTO или строка репозитория). */
export type DefinitionFacts = Pick<CustomFieldDefinition, 'id' | 'scope' | 'type' | 'settings'>;

/** Причина отказа значения (Р2): код читает интерфейс, текст — i18n веба. */
export type CustomFieldIssueReason = 'unknown' | 'invalid' | 'not_found' | 'inactive';

export interface CustomFieldIssue {
  fieldId: string;
  reason: CustomFieldIssueReason;
  message: string;
}

/** Справочник валют — системный код (Р10). */
const CURRENCY_CODE = 'currency';

/**
 * Проверка значений атрибутов (#431, Р1/Р2) — единственная точка серверной
 * валидации. Грамматика типа живёт в контрактах (`customFieldValueSchemaOf`),
 * здесь — ссылки: активный сотрудник, действующее управленческое
 * подразделение, активный вариант справочника, валюта из `currency`,
 * действующий контрагент. Ссылки читаются портами пачками (I3): только по
 * изменившимся значениям — архивный сотрудник в старом значении не блокирует
 * правку соседнего поля (Р2).
 */
@Injectable()
export class CustomFieldValueValidator {
  constructor(
    @Inject(USER_PROFILE_READER) private readonly users: UserProfileReader,
    @Inject(ORG_STRUCTURE_READER) private readonly org: OrgStructureReader,
    @Inject(DICTIONARY_READER) private readonly dictionaries: DictionaryReader,
    @Inject(COUNTERPARTY_READER) private readonly counterparties: CounterpartyReader,
  ) {}

  /**
   * Проверяет значения области. `definitions` — реестр области (включая
   * скрытые: служебные значения ставит автоматика, скрытый атрибут их
   * принимает). Пустой список — быстрый выход без обращений к портам.
   */
  async validate(
    scope: CustomFieldScope,
    definitions: ReadonlyArray<DefinitionFacts>,
    values: CustomFieldValues,
    tx?: TransactionClient,
  ): Promise<CustomFieldIssue[]> {
    const entries = Object.entries(values);
    if (entries.length === 0) return [];
    if (entries.length > CUSTOM_FIELD_LIMITS.changes) {
      return [{ fieldId: '', reason: 'invalid', message: 'more than 50 fields' }];
    }

    const byId = new Map(definitions.map((definition) => [definition.id, definition]));
    const issues: CustomFieldIssue[] = [];
    const accepted: Array<{ definition: DefinitionFacts; value: CustomFieldValue }> = [];

    for (const [fieldId, value] of entries) {
      const definition = byId.get(fieldId);
      if (!definition || definition.scope !== scope) {
        issues.push({ fieldId, reason: 'unknown', message: 'Unknown custom field' });
        continue;
      }
      if (!customFieldValueSchemaOf(definition).safeParse(value).success) {
        issues.push({ fieldId, reason: 'invalid', message: 'Value does not match field type' });
        continue;
      }
      accepted.push({ definition, value });
    }

    issues.push(...(await this.checkReferences(accepted, tx)));
    return issues;
  }

  /** Ссылочная часть: одна пачка на вид ссылки, затем сверка. */
  private async checkReferences(
    accepted: ReadonlyArray<{ definition: DefinitionFacts; value: CustomFieldValue }>,
    tx?: TransactionClient,
  ): Promise<CustomFieldIssue[]> {
    const userIds = new Set<string>();
    const departmentIds = new Set<string>();
    const itemIds = new Set<string>();
    const currencyIds = new Set<string>();
    const counterpartyIds = new Set<string>();

    const scalarIds = (value: CustomFieldValue): string[] =>
      Array.isArray(value) ? value : [String(value)];

    for (const { definition, value } of accepted) {
      switch (definition.type) {
        case 'user':
        case 'users':
          for (const id of scalarIds(value)) userIds.add(id);
          break;
        case 'department':
          departmentIds.add(String(value));
          break;
        case 'enum':
        case 'multienum':
          for (const id of scalarIds(value)) itemIds.add(id);
          break;
        case 'money':
          currencyIds.add((value as { currencyId: string }).currencyId);
          break;
        case 'counterparty':
          counterpartyIds.add(String(value));
          break;
        default:
          break;
      }
    }

    const [userRefs, activeUserIds, departments, items, currencies, counterparties] =
      await Promise.all([
        this.users.findRefs([...userIds], tx),
        this.users.filterActiveUserIds([...userIds], tx),
        this.org.departmentRefs([...departmentIds], tx),
        this.dictionaries.itemRefs([...itemIds], tx),
        this.dictionaries.itemRefs([...currencyIds], tx),
        Promise.all([...counterpartyIds].map((id) => this.counterparties.activeRef(id))),
      ]);

    // Валюта — элемент ИМЕННО системного справочника `currency` (Р10):
    // id чужого справочника значением денег не принимается.
    const currencyDictionaries = await this.dictionaries.dictionaryRefs(
      [...new Set(currencies.map((row) => row.dictionaryId))],
      tx,
    );
    const currencyDictionaryIds = new Set(
      currencyDictionaries.filter((row) => row.code === CURRENCY_CODE).map((row) => row.id),
    );

    const knownUsers = new Set(userRefs.map((ref) => ref.id));
    const activeUsers = new Set(activeUserIds);
    const departmentById = new Map(departments.map((row) => [row.id, row]));
    const itemById = new Map(items.map((row) => [row.id, row]));
    const currencyById = new Map(
      currencies
        .filter((row) => currencyDictionaryIds.has(row.dictionaryId))
        .map((row) => [row.id, row]),
    );
    const activeCounterparties = new Set(
      counterparties.filter((ref) => ref !== null).map((ref) => ref.id),
    );

    const issues: CustomFieldIssue[] = [];
    for (const { definition, value } of accepted) {
      const issue = checkOne({
        definition,
        value,
        scalarIds,
        knownUsers,
        activeUsers,
        departmentById,
        itemById,
        currencyById,
        activeCounterparties,
      });
      if (issue) issues.push({ fieldId: definition.id, ...issue });
    }
    return issues;
  }
}

interface ReferenceFacts {
  scalarIds: (value: CustomFieldValue) => string[];
  knownUsers: ReadonlySet<string>;
  activeUsers: ReadonlySet<string>;
  departmentById: ReadonlyMap<string, { id: string; name: string; isActive: boolean }>;
  itemById: ReadonlyMap<
    string,
    { id: string; dictionaryId: string; name: string; isActive: boolean }
  >;
  currencyById: ReadonlyMap<
    string,
    { id: string; dictionaryId: string; name: string; isActive: boolean }
  >;
  activeCounterparties: ReadonlySet<string>;
}

/** Сверка одного значения с фактами портов. */
function checkOne(
  input: {
    definition: DefinitionFacts;
    value: CustomFieldValue;
  } & ReferenceFacts,
): Pick<CustomFieldIssue, 'reason' | 'message'> | null {
  const { definition, value, scalarIds } = input;
  switch (definition.type) {
    case 'user':
    case 'users': {
      const ids = scalarIds(value);
      if (!ids.every((id) => input.knownUsers.has(id))) {
        return { reason: 'not_found', message: 'User not found' };
      }
      return ids.every((id) => input.activeUsers.has(id))
        ? null
        : { reason: 'inactive', message: 'User is deactivated' };
    }
    case 'department': {
      const department = input.departmentById.get(String(value));
      if (!department) return { reason: 'not_found', message: 'Department not found' };
      return department.isActive ? null : { reason: 'inactive', message: 'Department is archived' };
    }
    case 'enum':
    case 'multienum': {
      for (const id of scalarIds(value)) {
        const item = input.itemById.get(id);
        if (!item || item.dictionaryId !== definition.settings.dictionaryId) {
          return { reason: 'not_found', message: 'Dictionary item not found' };
        }
        if (!item.isActive) return { reason: 'inactive', message: 'Dictionary item archived' };
      }
      return null;
    }
    case 'money': {
      const currency = input.currencyById.get((value as { currencyId: string }).currencyId);
      if (!currency) return { reason: 'not_found', message: 'Currency not found' };
      return currency.isActive ? null : { reason: 'inactive', message: 'Currency archived' };
    }
    case 'project':
      // Проектов нет до #52: поле нельзя создать, значение принять некуда (Р11).
      return { reason: 'not_found', message: 'Project not found' };
    case 'counterparty':
      return input.activeCounterparties.has(String(value))
        ? null
        : { reason: 'not_found', message: 'Counterparty not found or archived' };
    default:
      return null;
  }
}
