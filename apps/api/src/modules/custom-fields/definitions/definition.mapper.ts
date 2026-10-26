import { Inject, Injectable } from '@nestjs/common';
import type { CustomFieldDefinition, CustomFieldRef, CustomFieldValue } from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import {
  DICTIONARY_READER,
  type DictionaryReader,
} from '../../dictionaries/ports/dictionary-reader.port.js';
import { CustomFieldRefsHydrator } from '../values/refs-hydrator.js';

/** Строка `field_definitions` в объёме DTO (схема — ADR-0029). */
export interface FieldDefinitionRow {
  id: string;
  scope: string;
  type: string;
  name: string;
  hint: string | null;
  settings: unknown;
  defaultValue: unknown;
  reportIndexed: boolean;
  hidden: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  /** Привязки к типам процессов (#432, Р8); пусто — атрибут нигде не виден. */
  typeBindings: { processTypeId: string }[];
}

/**
 * Строка определения → DTO контракта (#431): настройки типа, справочник
 * списка и ссылки статического умолчания (имена для колонки «По умолчанию»).
 * Пачки: один запрос справочников и один гидратор ссылок на список, а не на
 * строку — реестр области ≤ 100.
 */
@Injectable()
export class DefinitionMapper {
  constructor(
    @Inject(DICTIONARY_READER) private readonly dictionaries: DictionaryReader,
    private readonly refs: CustomFieldRefsHydrator,
  ) {}

  async toDtos(
    rows: readonly FieldDefinitionRow[],
    tx?: TransactionClient,
  ): Promise<CustomFieldDefinition[]> {
    if (rows.length === 0) return [];
    const definitions = rows.map((row) => this.base(row));

    const dictionaryIds = [
      ...new Set(
        definitions
          .filter((definition) => definition.type === 'enum' || definition.type === 'multienum')
          .map((definition) => definition.settings.dictionaryId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const dictionaries = await this.dictionaries.dictionaryRefs(dictionaryIds, tx);
    const dictionaryById = new Map(dictionaries.map((row) => [row.id, row]));

    const staticDefaults: Record<string, CustomFieldValue> = {};
    for (const definition of definitions) {
      if (definition.defaultValue?.kind === 'static') {
        staticDefaults[definition.id] = definition.defaultValue.value;
      }
    }
    const defaultRefs = await this.refs.hydrate(
      rows.map((row) => this.base(row)),
      staticDefaults,
      tx,
    );
    const refsByKey = new Map(defaultRefs.map((ref) => [`${ref.kind}:${ref.id}`, ref]));

    return definitions.map((definition) => {
      const dictionaryId =
        definition.type === 'enum' || definition.type === 'multienum'
          ? definition.settings.dictionaryId
          : undefined;
      const dictionary = dictionaryId ? dictionaryById.get(dictionaryId) : undefined;
      return {
        ...definition,
        dictionary: dictionary
          ? {
              id: dictionary.id,
              code: dictionary.code,
              name: dictionary.name,
              isSystem: dictionary.isSystem,
            }
          : null,
        defaultRefs: refsOfDefault(definition, refsByKey),
      };
    });
  }

  async toDto(row: FieldDefinitionRow, tx?: TransactionClient): Promise<CustomFieldDefinition> {
    const [dto] = await this.toDtos([row], tx);
    return dto!;
  }

  /** Поля DTO без справочника и ссылок умолчания (они собираются пачкой). */
  private base(row: FieldDefinitionRow): Omit<CustomFieldDefinition, 'dictionary' | 'defaultRefs'> {
    return {
      id: row.id,
      scope: row.scope as CustomFieldDefinition['scope'],
      type: row.type as CustomFieldDefinition['type'],
      name: row.name,
      hint: row.hint,
      settings: (row.settings ?? {}) as CustomFieldDefinition['settings'],
      defaultValue: (row.defaultValue ?? null) as CustomFieldDefinition['defaultValue'],
      reportIndexed: row.reportIndexed,
      hidden: row.hidden,
      // Привязки к типам (#432, Р8): порядок детерминирован — id по возрастанию.
      typeIds: row.typeBindings.map((binding) => binding.processTypeId).sort(),
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** Ссылки, на которые указывает статическое умолчание определения. */
function refsOfDefault(
  definition: Omit<CustomFieldDefinition, 'dictionary' | 'defaultRefs'>,
  refsByKey: ReadonlyMap<string, CustomFieldRef>,
): CustomFieldRef[] {
  if (definition.defaultValue?.kind !== 'static') return [];
  const value = definition.defaultValue.value;
  const ids: string[] = [];
  switch (definition.type) {
    case 'user':
    case 'users':
    case 'enum':
    case 'multienum':
      ids.push(...(Array.isArray(value) ? (value as string[]) : [String(value)]));
      break;
    case 'department':
    case 'counterparty':
    case 'project':
      ids.push(String(value));
      break;
    case 'money':
      ids.push((value as { currencyId: string }).currencyId);
      break;
    default:
      break;
  }
  const kinds: Record<string, CustomFieldRef['kind']> = {
    user: 'user',
    users: 'user',
    department: 'department',
    enum: 'dictionary_item',
    multienum: 'dictionary_item',
    money: 'dictionary_item',
    counterparty: 'counterparty',
    project: 'project',
  };
  const kind = kinds[definition.type];
  if (!kind) return [];
  return ids
    .map((id) => refsByKey.get(`${kind}:${id}`))
    .filter((ref): ref is CustomFieldRef => ref !== undefined);
}
