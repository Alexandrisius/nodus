import type { ProcessType } from '@nodus/contracts';
import {
  isDefaultProcessType,
  taskCardBlockOrder,
  taskRoleKeySchema,
  typeConfigOf,
  ui,
} from '@nodus/contracts';

/**
 * Сводки строк «›» корня «Настроек типа» (#432, В6): одна строка под
 * названием раздела — что настроено сейчас (грамматика `SectionLink`,
 * как «Кто видит ›» у кнопки). Чистые функции: юнит-тест рядом.
 */

const t = ui.automation.typeSettings;

/** Первая буква строчная — названия блоков в перечислении после «Скрыты:». */
const lower = (text: string) => text.charAt(0).toLocaleLowerCase('ru') + text.slice(1);

/** Имена ролей списка доступа; роли ещё грузятся — «…», пусто — «никто». */
function roleNames(ids: readonly string[], roleName: (id: string) => string | undefined): string {
  if (ids.length === 0) return t.access.summaryNoRoles;
  const names = ids.map(roleName).filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(', ') : '…';
}

/** «Видят все · создают все», «Видят: Руководство · создают: Руководство»,
 *  «Видят все · создаёт только администратор». «Стандартный» — всем. */
export function accessSummary(
  type: ProcessType,
  roleName: (id: string) => string | undefined,
): string {
  if (isDefaultProcessType(type)) return t.access.summaryDefault;
  const { view, create } = typeConfigOf(type).access;
  const viewText =
    view === null
      ? t.access.summaryViewAll
      : `${t.access.summaryView} ${roleNames(view, roleName)}`;
  const createText = !type.creatable
    ? t.access.summaryCreateNobody
    : create === null
      ? t.access.summaryCreateAll
      : `${t.access.summaryCreate} ${roleNames(create, roleName)}`;
  return `${viewText} · ${createText}`;
}

/** «Все блоки видны» или «Скрыты: чек-лист, подзадачи» (порядок карточки). */
export function blocksSummary(type: ProcessType): string {
  const hidden = typeConfigOf(type).card.hiddenBlocks;
  const names = taskCardBlockOrder
    .filter((block) => hidden.includes(block))
    .map((block) => lower(t.card.blocksNames[block]));
  return names.length > 0 ? `${t.card.summaryHidden} ${names.join(', ')}` : t.card.summaryAllBlocks;
}

/** «Стандартные» или «Постановщик → Заявитель, …» (порядок ролей). */
export function roleLabelsSummary(type: ProcessType): string {
  const labels = typeConfigOf(type).card.roleLabels;
  const renamed = taskRoleKeySchema.options
    .filter((role) => labels[role])
    .map((role) => `${t.card.roles[role]} → ${labels[role]}`);
  return renamed.length > 0 ? renamed.join(', ') : t.card.summaryStandardRoles;
}

/** «Вх-ГГГГ/N» — формат серии типа письма (только чтение, #55/Р2/#504). */
export function numberingSummary(type: ProcessType): string {
  if (!type.numbering) return t.numbering.none;
  return `${type.numbering.prefix}-${t.numbering.yearToken}/${t.numbering.numberToken}`;
}
