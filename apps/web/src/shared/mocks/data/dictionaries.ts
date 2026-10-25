import type { Dictionary, DictionaryItem } from '@nodus/contracts';
import { SystemDictionary } from '@nodus/contracts';

import { demoDocumentKinds } from './counterparties.js';

/** Демо-справочники (#431, Р10): системные `currency` и `document-kind`
 *  (id элементов совпадают с моками писем) и пользовательские «Виды работ»,
 *  «Объекты». Значения полей ссылаются на id элементов (I15). */

const did = (n: number): string => `d1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iid = (n: number): string => `d2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const dictionaryIds = {
  currency: did(1),
  documentKind: did(2),
  workKind: did(3),
  object: did(4),
};

export const currencyIds = {
  byn: iid(1),
  rub: iid(2),
  usd: iid(3),
  eur: iid(4),
  cny: iid(5),
};

export const workKindIds = {
  design: iid(11),
  approval: iid(12),
  expertise: iid(13),
};

export const objectIds = {
  main: iid(21),
  warehouse: iid(22),
  admin: iid(23),
};

export const demoDictionaries: Dictionary[] = [
  {
    id: dictionaryIds.currency,
    code: SystemDictionary.CURRENCY,
    name: 'Валюты',
    hierarchical: false,
    isSystem: true,
  },
  {
    id: dictionaryIds.documentKind,
    code: SystemDictionary.DOCUMENT_KIND,
    name: 'Виды документов',
    hierarchical: false,
    isSystem: true,
  },
  {
    id: dictionaryIds.workKind,
    code: 'work-kind',
    name: 'Виды работ',
    hierarchical: false,
    isSystem: false,
  },
  {
    id: dictionaryIds.object,
    code: 'object',
    name: 'Объекты',
    hierarchical: false,
    isSystem: false,
  },
];

function item(
  id: string,
  dictionaryId: string,
  name: string,
  sortOrder: number,
  isActive = true,
): DictionaryItem {
  return { id, dictionaryId, parentId: null, code: null, name, sortOrder, isActive };
}

export const demoDictionaryItems: DictionaryItem[] = [
  item(currencyIds.byn, dictionaryIds.currency, 'BYN', 0),
  item(currencyIds.rub, dictionaryIds.currency, 'RUB', 1),
  item(currencyIds.usd, dictionaryIds.currency, 'USD', 2),
  item(currencyIds.eur, dictionaryIds.currency, 'EUR', 3),
  item(currencyIds.cny, dictionaryIds.currency, 'CNY', 4),
  ...demoDocumentKinds.map((kind, index) =>
    item(kind.id, dictionaryIds.documentKind, kind.name, index),
  ),
  item(workKindIds.design, dictionaryIds.workKind, 'Проектирование', 0),
  item(workKindIds.approval, dictionaryIds.workKind, 'Согласование', 1),
  item(workKindIds.expertise, dictionaryIds.workKind, 'Экспертиза', 2),
  item(objectIds.main, dictionaryIds.object, 'Главный корпус', 0),
  item(objectIds.warehouse, dictionaryIds.object, 'Склад готовой продукции', 1),
  item(objectIds.admin, dictionaryIds.object, 'Административный корпус', 2),
];

export function dictionaryByCode(code: string): Dictionary | undefined {
  return demoDictionaries.find((dictionary) => dictionary.code === code);
}

export function dictionaryById(id: string): Dictionary | undefined {
  return demoDictionaries.find((dictionary) => dictionary.id === id);
}

export function itemsOf(code: string, includeArchived = false): DictionaryItem[] {
  const dictionary = dictionaryByCode(code);
  if (!dictionary) return [];
  return demoDictionaryItems
    .filter((entry) => entry.dictionaryId === dictionary.id)
    .filter((entry) => includeArchived || entry.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function itemById(id: string): DictionaryItem | undefined {
  return demoDictionaryItems.find((entry) => entry.id === id);
}

/** Код нового справочника генерирует «сервер»: `list-<8hex>` (неизменен). */
export function nextDictionaryCode(): string {
  return `list-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
