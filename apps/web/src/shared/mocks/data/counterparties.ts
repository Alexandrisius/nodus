import type {
  ContactPerson,
  CounterpartyCard,
  CounterpartyListItem,
  CounterpartyRef,
} from '@nodus/contracts';

/** Демо-справочник контрагентов: живой API CRM (#460) — основной, моки
 *  держат цельный мир для `--mock all` (письма, проекты, поле «Контрагент»
 *  ссылаются на эти id). Ссылка (`CounterpartyRef`) — краткое название, как
 *  у сервера. Контакты — подписанты писем (#55); новые контрагенты и
 *  контакты из регистрации письма добавляются в этот же массив
 *  (`crm-write-handlers`). */

const did = (n: number): string => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pid = (n: number): string => `d3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const counterpartyIds = {
  galurgiya: did(1),
  stroyzakazchik: did(2),
  minstroy: did(3),
  tehssnab: did(4),
  promstroymontazh: did(5),
};

export const contactIds = {
  petrov: pid(1),
  lukashevich: pid(2),
  sidorenko: pid(3),
  goncharova: pid(4),
  kovalev: pid(5),
  zhukov: pid(6),
  melnik: pid(7),
};

function contact(
  id: string,
  fullName: string,
  position: string | null,
  phone: string | null,
  email: string | null,
): ContactPerson {
  return { id, fullName, position, phone, email, archivedAt: null };
}

function card(
  id: string,
  fullName: string,
  shortName: string,
  unp: string | null,
  address: string | null,
  contactPersons: ContactPerson[] = [],
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
    contactPersons,
    archivedAt: null,
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
  };
}

/** Изменяемый массив: моки CRM дописывают созданных «на лету» (#55). */
const demoCards: CounterpartyCard[] = [
  card(
    did(1),
    'Акционерное общество «Галургия»',
    'АО «Галургия»',
    '100190123',
    'Солигорск, ул. Промышленная, 5',
    [
      contact(
        contactIds.lukashevich,
        'Лукашевич Анна Викторовна',
        'Начальник ПТО',
        '+375 174 26-14-08',
        'a.lukashevich@galurgiya.by',
      ),
      contact(
        contactIds.petrov,
        'Петров Игорь Семёнович',
        'Главный инженер',
        '+375 174 26-14-00',
        null,
      ),
    ],
  ),
  card(
    did(2),
    'Общество с ограниченной ответственностью «СтройЗаказчик»',
    'ООО «СтройЗаказчик»',
    '191234567',
    'Минск, пр-т Победителей, 84',
    [
      contact(
        contactIds.goncharova,
        'Гончарова Марина Игоревна',
        'Инженер технадзора',
        '+375 29 655-12-40',
        null,
      ),
      contact(
        contactIds.sidorenko,
        'Сидоренко Олег Павлович',
        'Директор',
        '+375 17 388-40-12',
        null,
      ),
    ],
  ),
  card(
    did(3),
    'Министерство архитектуры и строительства Республики Беларусь',
    'Минстройархитектуры',
    null,
    'Минск, ул. Мясникова, 39',
    [
      contact(
        contactIds.kovalev,
        'Ковалёв Дмитрий Николаевич',
        'Начальник управления проектирования',
        null,
        null,
      ),
    ],
  ),
  card(
    did(4),
    'Общество с ограниченной ответственностью «ТехСнаб»',
    'ООО «ТехСнаб»',
    '100555777',
    'Минск, ул. Тимирязева, 65',
    [
      contact(
        contactIds.zhukov,
        'Жуков Сергей Андреевич',
        'Коммерческий директор',
        '+375 44 701-22-90',
        's.zhukov@tehsnab.by',
      ),
    ],
  ),
  card(
    did(5),
    'Общество с ограниченной ответственностью «ПромСтройМонтаж»',
    'ООО «ПромСтройМонтаж»',
    '100888999',
    'Гомель, ул. Советская, 12',
    [
      contact(
        contactIds.melnik,
        'Мельник Виктор Иванович',
        'Главный инженер',
        '+375 29 340-55-71',
        null,
      ),
    ],
  ),
  {
    ...card(did(6), 'ООО «Старый подрядчик»', 'Старый подрядчик', '100000001', null),
    archivedAt: '2026-06-01T09:00:00.000Z',
  },
];

export const demoCounterparties: CounterpartyCard[] = demoCards;

export function demoCounterpartyById(id: string): CounterpartyCard | undefined {
  return demoCards.find((c) => c.id === id);
}

export function counterpartyRefById(id: string): CounterpartyRef | undefined {
  const found = demoCounterpartyById(id);
  return found ? { id: found.id, name: found.shortName } : undefined;
}

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
    contactsCount: c.contactPersons.filter((p) => p.archivedAt === null).length,
    archivedAt: c.archivedAt,
  }));
}
