import type {
  CounterpartyCard,
  CounterpartyListItem,
  CounterpartyRef,
  DocumentKind,
  Mailbox,
} from '@nodus/contracts';

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

/** Демо-справочник для UI-чекпоинта #431 (поля контрагентов) и пикера
 *  поля «Контрагент»: только чтение, запись — живой API CRM (#460). */
const demoCards: CounterpartyCard[] = [
  card(did(1), 'АО «Галургия»', 'АО «Галургия»', '100190123', 'Солигорск, ул. Промышленная, 5'),
  card(did(2), 'ООО «СтройЗаказчик»', 'СтройЗаказчик', '191234567', 'Минск, пр-т Победителей, 84'),
  card(did(3), 'Минстройархитектуры', 'Минстройархитектуры', null, 'Минск, ул. Мясникова, 39'),
  card(did(4), 'ООО «ТехСнаб»', 'ТехСнаб', '100555777', 'Минск, ул. Тимирязева, 65'),
  card(
    did(5),
    'ООО «ПромСтройМонтаж»',
    'ПромСтройМонтаж',
    '100888999',
    'Гомель, ул. Советская, 12',
  ),
  {
    ...card(did(6), 'ООО «Старый подрядчик»', 'Старый подрядчик', '100000001', null),
    archivedAt: '2026-06-01T09:00:00.000Z',
  },
];

function card(
  id: string,
  fullName: string,
  shortName: string,
  unp: string | null,
  address: string | null,
): CounterpartyCard {
  return {
    id,
    fullName,
    shortName,
    unp,
    address,
    email: null,
    phone: null,
    customFields: {},
    lettersCount: 0,
    projectsCount: 0,
    contactPersons: [],
    archivedAt: null,
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

export const demoCounterparties: CounterpartyCard[] = demoCards;

export function demoCounterpartyList(): CounterpartyListItem[] {
  return demoCards.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    shortName: c.shortName,
    unp: c.unp,
    address: c.address,
    email: c.email,
    phone: c.phone,
    lettersCount: c.lettersCount,
    projectsCount: c.projectsCount,
    contactsCount: c.contactPersons.length,
    archivedAt: c.archivedAt,
  }));
}

export function demoCounterpartyById(id: string): CounterpartyCard | undefined {
  return demoCards.find((c) => c.id === id);
}
