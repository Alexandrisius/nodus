import type {
  CustomFieldDefinition,
  CustomFieldScope,
  CustomFieldSettings,
  CustomFieldType,
  CustomFieldValues,
} from '@nodus/contracts';
import { SystemDictionary } from '@nodus/contracts';

import { currencyIds, dictionaryByCode, itemsOf, workKindIds } from './dictionaries.js';
import { departmentIds } from './org-ids.js';
import { projectRefs, tid } from './task-item-factory.js';
import { userIds } from './users.js';

/** Демо-реестр кастомных полей (#431) — по полю каждого типа для задач,
 *  поля писем и контрагентов; один скрытый (служебный). Определения живут
 *  массивом: мок-хендлеры создают, правят и удаляют их как сервер. */

const fid = (n: number): string => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const fieldIds = {
  invoiceNumber: fid(1),
  handoverDate: fid(2),
  customer: fid(3),
  contractAmount: fid(4),
  workKind: fid(5),
  objects: fid(6),
  overtime: fid(7),
  approved: fid(8),
  projectFolder: fid(9),
  customerSite: fid(10),
  applicantDepartment: fid(11),
  area: fid(12),
  customerComment: fid(13),
  customerObservers: fid(14),
  sourceProject: fid(15),
  contractor: fid(16),
  legacyCode: fid(17),
  letterReplyNumber: fid(21),
  letterReplyDate: fid(22),
  counterpartyErp: fid(31),
};

const STAMP = '2026-10-20T09:00:00.000Z';

function definition(
  id: string,
  scope: CustomFieldScope,
  type: CustomFieldType,
  name: string,
  sortOrder: number,
  extra: Partial<CustomFieldDefinition> = {},
): CustomFieldDefinition {
  return {
    id,
    scope,
    type,
    name,
    hint: null,
    settings: {},
    dictionary: null,
    defaultValue: null,
    defaultRefs: [],
    reportIndexed: false,
    hidden: false,
    sortOrder,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

function dictionaryRef(code: string) {
  const dictionary = dictionaryByCode(code);
  return dictionary
    ? {
        id: dictionary.id,
        code: dictionary.code,
        name: dictionary.name,
        isSystem: dictionary.isSystem,
      }
    : null;
}

const moneySettings: CustomFieldSettings = { currencyId: currencyIds.byn };

/** Определения в порядке реестра (области: task, letter, project, counterparty). */
export const demoCustomFieldDefinitions: CustomFieldDefinition[] = [
  definition(fieldIds.invoiceNumber, 'task', 'text', '№ накладной', 0, {
    hint: 'Номер из накладной поставщика',
  }),
  definition(fieldIds.handoverDate, 'task', 'date', 'Дата передачи', 1),
  definition(fieldIds.customer, 'task', 'user', 'Сотрудник-заказчик', 2),
  definition(fieldIds.contractAmount, 'task', 'money', 'Сумма договора', 3, {
    settings: moneySettings,
    dictionary: dictionaryRef(SystemDictionary.CURRENCY),
  }),
  definition(fieldIds.workKind, 'task', 'enum', 'Вид работ', 4, {
    settings: { dictionaryId: dictionaryByCode('work-kind')!.id },
    dictionary: dictionaryRef('work-kind'),
    defaultValue: { kind: 'static', value: workKindIds.design },
  }),
  definition(fieldIds.objects, 'task', 'multienum', 'Объекты', 5, {
    settings: { dictionaryId: dictionaryByCode('object')!.id },
    dictionary: dictionaryRef('object'),
  }),
  definition(fieldIds.overtime, 'task', 'duration', 'Часы переработки', 6),
  definition(fieldIds.approved, 'task', 'bool', 'Согласовано с заказчиком', 7),
  definition(fieldIds.projectFolder, 'task', 'link', 'Папка проекта', 8, {
    hint: 'Путь в общем хранилище',
  }),
  definition(fieldIds.customerSite, 'task', 'link', 'Сайт заказчика', 9),
  definition(fieldIds.applicantDepartment, 'task', 'department', 'Подразделение заявителя', 10, {
    defaultValue: { kind: 'author_department' },
  }),
  definition(fieldIds.area, 'task', 'number', 'Площадь, м²', 11, { settings: { precision: 2 } }),
  definition(fieldIds.customerComment, 'task', 'long_text', 'Комментарий заказчика', 12),
  definition(fieldIds.customerObservers, 'task', 'users', 'Наблюдатели заказчика', 13),
  definition(fieldIds.sourceProject, 'task', 'project', 'Проект-источник', 14),
  definition(fieldIds.contractor, 'task', 'counterparty', 'Подрядчик', 15),
  definition(fieldIds.legacyCode, 'task', 'text', 'Шифр сметы (служебный)', 16, {
    hint: 'Заполняет автоматика из сметной программы',
    hidden: true,
  }),
  definition(fieldIds.letterReplyNumber, 'letter', 'text', 'Исх. номер контрагента', 0),
  definition(fieldIds.letterReplyDate, 'letter', 'date', 'Дата ответа', 1),
  definition(fieldIds.counterpartyErp, 'counterparty', 'text', 'Код 1С', 0),
];

export function demoFieldById(id: string): CustomFieldDefinition | undefined {
  return demoCustomFieldDefinitions.find((entry) => entry.id === id);
}

export function demoFieldsOfScope(scope: CustomFieldScope): CustomFieldDefinition[] {
  return demoCustomFieldDefinitions
    .filter((entry) => entry.scope === scope)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Значения демо-задач: часть задач заполнена, остальные — `{}`. */
export const demoTaskCustomFields: Record<string, CustomFieldValues> = {
  [tid(2)]: {
    [fieldIds.invoiceNumber]: '№ 118-2026',
    [fieldIds.handoverDate]: '2026-10-20',
    [fieldIds.customer]: userIds.klevantovich,
    [fieldIds.contractAmount]: { amount: 128500.5, currencyId: currencyIds.byn },
    [fieldIds.workKind]: workKindIds.design,
    [fieldIds.objects]: [itemsOf('object')[0]!.id, itemsOf('object')[1]!.id],
    [fieldIds.overtime]: 240,
    [fieldIds.approved]: true,
    [fieldIds.projectFolder]: '\\\\srv\\proekt\\0359\\КЖ',
    [fieldIds.customerSite]: 'https://galurgiya.by',
    [fieldIds.applicantDepartment]: departmentIds.bim,
    [fieldIds.area]: 1240.75,
    [fieldIds.customerComment]: 'Согласовано при условии замены узлов КЖ-14 и КЖ-18.',
    [fieldIds.customerObservers]: [userIds.karpovich, userIds.matorin],
    [fieldIds.sourceProject]: projectRefs.p4.id,
    [fieldIds.contractor]: 'd0000000-0000-4000-8000-000000000001',
    [fieldIds.legacyCode]: 'СМ-0359-14',
  },
  [tid(5)]: {
    [fieldIds.invoiceNumber]: '№ 77',
    [fieldIds.handoverDate]: '2026-10-12',
    [fieldIds.workKind]: workKindIds.approval,
    [fieldIds.overtime]: 45,
    [fieldIds.area]: 86.5,
  },
  [tid(12)]: {
    [fieldIds.invoiceNumber]: '№ 121',
    [fieldIds.objects]: [itemsOf('object')[2]!.id],
    [fieldIds.approved]: true,
  },
};

/** Подразделение автора — снимок для умолчания (Р5): текущий пользователь
 *  демо-мира сидит в BIM-отделе. */
export function demoAuthorDepartment(): string {
  return departmentIds.bim;
}
