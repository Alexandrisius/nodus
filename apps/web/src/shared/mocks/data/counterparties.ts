import type {
  ContactPerson,
  CounterpartyCard,
  CounterpartyRef,
  DocumentKind,
  Mailbox,
} from '@nodus/contracts';

/** Демо-справочник контрагентов (модель v2 корреспонденции, вердикт
 *  владельца 22.09.2026): заказчики, подрядчики, поставщики, госорганы —
 *  живая история компании из писем и проектов. Моками остаются только
 *  ссылки для писем/проектов: сам справочник с #460 живёт на бэкенде CRM. */

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

function contact(
  n: number,
  fullName: string,
  position: string | null,
  phone: string | null,
  email: string | null,
): ContactPerson {
  return { id: kid(100 + n), fullName, position, phone, email, archivedAt: null };
}

/** Демо-карточка: поля, которых в исторических данных нет, — дефолтами. */
function card(
  seed: Omit<
    CounterpartyCard,
    'customFields' | 'lettersCount' | 'projectsCount' | 'archivedAt' | 'createdAt' | 'updatedAt'
  >,
): CounterpartyCard {
  return {
    ...seed,
    customFields: {},
    lettersCount: 0,
    projectsCount: 0,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export const demoCounterpartyCards: CounterpartyCard[] = [
  card({
    id: did(1),
    fullName: 'Открытое акционерное общество «Галургия»',
    shortName: 'АО «Галургия»',
    unp: '100123456',
    address: '220004, г. Минск, ул. Притыцкого, 62, офис 410',
    email: null,
    phone: null,
    contactPersons: [
      contact(
        1,
        'Малевич Ростислав Тарасович',
        'Начальник отдела экспертизы',
        '+375291234567',
        'malevich@galurgiya.by',
      ),
      contact(
        2,
        'Кузьменко Ирина Олеговна',
        'Инженер технадзора',
        '+375293345678',
        'kuzmenko@galurgiya.by',
      ),
    ],
  }),
  card({
    id: did(2),
    fullName: 'Общество с ограниченной ответственностью «СтройЗаказчик»',
    shortName: 'ООО «СтройЗаказчик»',
    unp: '190654321',
    address: '220020, г. Минск, пр-т Победителей, 100, офис 412',
    email: null,
    phone: null,
    contactPersons: [
      contact(
        3,
        'Савельев Николай Петрович',
        'Главный инженер проекта',
        '+375297654321',
        'savelev@stroyzakaz.by',
      ),
    ],
  }),
  card({
    id: did(3),
    fullName: 'Министерство архитектуры и строительства Республики Беларусь',
    shortName: 'Минстройархитектуры',
    unp: null,
    address: '220048, г. Минск, ул. Мясникова, 39',
    email: null,
    phone: null,
    contactPersons: [
      contact(
        4,
        'Гордон Виктор Андреевич',
        'Председатель проверочной комиссии',
        '+375172001122',
        null,
      ),
    ],
  }),
  card({
    id: did(4),
    fullName: 'Общество с ограниченной ответственностью «ТехСнаб»',
    shortName: 'ООО «ТехСнаб»',
    unp: '192334455',
    address: '220113, г. Минск, ул. Мележа, 1, офис 415',
    email: null,
    phone: null,
    contactPersons: [
      contact(
        5,
        'Прудникова Ирина Леонидовна',
        'Коммерческий директор',
        '+375296789012',
        'prudnikova@tehsnab.by',
      ),
    ],
  }),
  card({
    id: did(5),
    fullName: 'Общество с ограниченной ответственностью «ПромСтройМонтаж»',
    shortName: 'ООО «ПромСтройМонтаж»',
    unp: '191778899',
    address: '220123, г. Минск, ул. В. Хоружей, 25/3, офис 18',
    email: null,
    phone: null,
    contactPersons: [
      contact(
        6,
        'Гриневич Сергей Иванович',
        'Главный инженер',
        '+375295566778',
        'grinevich@psm.by',
      ),
    ],
  }),
];

export const counterpartyIds = {
  galurgiya: did(1),
  stroyzakazchik: did(2),
  minstroy: did(3),
  tehssnab: did(4),
  promstroymontazh: did(5),
};

export function counterpartyRefById(id: string): CounterpartyRef | undefined {
  const card = demoCounterpartyCards.find((c) => c.id === id);
  return card ? { id: card.id, name: card.shortName } : undefined;
}
