import type { InjectionToken } from '@nestjs/common';
import type {
  CustomFieldDefinition,
  CustomFieldRef,
  CustomFieldScope,
  CustomFieldValue,
  CustomFieldValues,
} from '@nodus/contracts';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';

/**
 * Порт реестра кастомных атрибутов для модулей-владельцев сущностей
 * (#431, ADR-0029, Р2). Владелец (tasks, письма, проекты, контрагенты)
 * НЕ читает `field_definitions` и НЕ валидирует значения сам: он зовёт
 * `prepareCreate`/`prepareUpdate` и пишет полученный JSONB в свою колонку.
 * Одна точка динамической валидации (I7) — здесь, а не в каждом модуле.
 *
 * Порядок в `changes` — порядок ключей патча; значения — уже проверенные
 * (тип, активные ссылки).
 */
export const CUSTOM_FIELD_REGISTRY: InjectionToken = 'CUSTOM_FIELD_REGISTRY';

/** Изменение значения для события `task.updated.customFieldChanges` (Р12). */
export interface RegistryFieldChange {
  fieldId: string;
  from: CustomFieldValue | null;
  to: CustomFieldValue | null;
}

export interface PrepareCreateArgs {
  /** Значения, пришедшие от клиента (могут быть неполными). */
  input: CustomFieldValues;
  /** Автор сущности — источник умолчания «подразделение автора» (Р5). */
  authorId: string;
  /** Актёр запроса (#52): значения-ссылки на проекты проверяются на
   *  видимость актёру (секретный проект нельзя поставить значением). */
  actorId: string;
  /** Тип создаваемой сущности (#432, Р8): умолчания — только привязанных
   *  атрибутов, значение непривязанного — 422 `not_in_type`. */
  typeId?: string;
}

export interface PrepareUpdateArgs {
  /** Текущие значения сущности (JSONB как есть). */
  current: CustomFieldValues;
  /** Патч: `null` удаляет ключ; непустые — проверяются. */
  patch: Record<string, CustomFieldValue | null>;
  /** Актёр запроса (#52): проверка видимости значений-ссылок на проекты. */
  actorId: string;
  /** Тип сущности (#432, Р8): запись непривязанного — 422 `not_in_type`,
   *  очистка (`null`) разрешена всегда. */
  typeId?: string;
}

/** Что читать из реестра: `typeId` — только привязанные к типу (#432). */
export interface RegistryQuery {
  typeId?: string;
}

export interface CustomFieldRegistry {
  /** Определения области (включая скрытые — служебные значения пишет
   *  автоматика). Порядок — карточки и фильтров. */
  definitions(
    scope: CustomFieldScope,
    opts?: RegistryQuery,
    tx?: TransactionClient,
  ): Promise<CustomFieldDefinition[]>;

  /** Создание сущности: умолчания (невалидные пропускаются) + ввод
   *  (явное значение важнее) + проверка. Ошибка — 422 со списком полей. */
  prepareCreate(
    scope: CustomFieldScope,
    args: PrepareCreateArgs,
    tx?: TransactionClient,
  ): Promise<CustomFieldValues>;

  /** Правка: `null` удаляет ключ, проверяются ТОЛЬКО изменённые значения. */
  prepareUpdate(
    scope: CustomFieldScope,
    args: PrepareUpdateArgs,
    tx?: TransactionClient,
  ): Promise<{ next: CustomFieldValues; changes: RegistryFieldChange[] }>;

  /** Ссылки для показа значений детали (Р6): имена, аватары, архивность.
   *  actorId (#52): ссылки-проекты скрываются, если проект не виден актёру. */
  refs(
    scope: CustomFieldScope,
    values: CustomFieldValues,
    actorId: string,
    tx?: TransactionClient,
  ): Promise<CustomFieldRef[]>;
}
