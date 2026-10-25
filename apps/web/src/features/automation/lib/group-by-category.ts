import type { ProcessCategory, ProcessType } from '@nodus/contracts';

export interface ProcessTypeGroup {
  category: ProcessCategory;
  types: ProcessType[];
}

/** Группы списка типов по категории (порядок — первый встреченный).
 *  Заголовки групп показываются, только когда категорий две и больше
 *  (решение владельца 25.10): пока категория одна, вид списка прежний. */
export function groupByCategory(types: readonly ProcessType[]): ProcessTypeGroup[] {
  const groups = new Map<ProcessCategory, ProcessType[]>();
  for (const type of types) {
    groups.set(type.category, [...(groups.get(type.category) ?? []), type]);
  }
  return [...groups].map(([category, list]) => ({ category, types: list }));
}
