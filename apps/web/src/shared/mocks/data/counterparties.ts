import type { CounterpartyRef, DocumentKind, Mailbox } from '@nodus/contracts';

/** Справочник контрагентов живёт на бэкенде CRM (#460) — моками остались
 *  только ССЫЛКИ: демо-письма и демо-проекты ссылаются на контрагентов по id
 *  (домены letters/projects на моках до #55/#52). Новых контрагентов в моках
 *  нет: создание идёт в живой справочник. */

const did = (n: number): string => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const kid = (n: number): string => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Общий ящик компании (единственный в концепте; личные ящики — фаза 2
 *  продукта, переключатель «Общий / Личная» — задел направления). */
export const sharedMailbox: Mailbox = {
  id: 'f0000000-0000-4000-8000-000000000001',
  address: 'info@passatproekt.by',
  kind: 'shared',
};

/** Виды документов — мок словаря `dictionaries` (сид — бэкенд-issue #54).
 *  Дефолт регистрации — «Письмо»; секретарь словарь не трогает. */
export const demoDocumentKinds: DocumentKind[] = [
  { id: kid(1), name: 'Письмо' },
  { id: kid(2), name: 'Договор' },
  { id: kid(3), name: 'Приказ' },
  { id: kid(4), name: 'Запрос' },
  { id: kid(5), name: 'Акт' },
];

export const defaultDocumentKind = demoDocumentKinds[0] as DocumentKind;

export function documentKindById(id: string): DocumentKind | undefined {
  return demoDocumentKinds.find((k) => k.id === id);
}

/** Витринные имена демо-контрагентов (живая история компании из писем и
 *  проектов): только для ссылок в мок-данных, реквизитов здесь нет. */
const demoCounterpartyNames: Record<string, string> = {
  [did(1)]: 'АО «Галургия»',
  [did(2)]: 'ООО «СтройЗаказчик»',
  [did(3)]: 'Минстройархитектуры',
  [did(4)]: 'ООО «ТехСнаб»',
  [did(5)]: 'ООО «ПромСтройМонтаж»',
};

export const counterpartyIds = {
  galurgiya: did(1),
  stroyzakazchik: did(2),
  minstroy: did(3),
  tehssnab: did(4),
  promstroymontazh: did(5),
};

export function counterpartyRefById(id: string): CounterpartyRef | undefined {
  const name = demoCounterpartyNames[id];
  return name ? { id, name } : undefined;
}
