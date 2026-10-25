/**
 * Шаблон «Моего плана» (ADR-0008) — данные модуля задач во временном
 * исключении ADR-0024: личные маршруты (`workflows.kind = personal`) живут в
 * таблицах «Процессов» до #438/#439. Каждому состоянию — минимум одна
 * колонка (автоперемещение); переходов у личного маршрута нет. Колонка этапа
 * «Утверждение» — «На утверждении»: работа сдана, не завершена.
 */
export const PERSONAL_TEMPLATE_CODE = 'personal.template';

/** Ревизия шаблона (совпадает с последней ревизией каталога, где он менялся:
 *  колонка «На утверждении» — ревизия 3). Существующие доски не трогаются. */
export const PERSONAL_TEMPLATE_REVISION = 3;

export interface PersonalTemplateStage {
  code: string;
  name: string;
  color: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  systemState: 'backlog' | 'active' | 'paused' | 'done' | 'closed';
  outcome?: 'success' | 'cancelled';
  isInitial?: boolean;
}

export const PERSONAL_TEMPLATE = {
  code: PERSONAL_TEMPLATE_CODE,
  name: 'Мой план',
  stages: [
    {
      code: 'backlog',
      name: 'Новые',
      color: 'neutral',
      systemState: 'backlog',
      isInitial: true,
    },
    { code: 'active', name: 'В работе', color: 'success', systemState: 'active' },
    { code: 'paused', name: 'Отложенные', color: 'danger', systemState: 'paused' },
    { code: 'done', name: 'На утверждении', color: 'warning', systemState: 'done' },
    {
      code: 'closed',
      name: 'Завершённые',
      color: 'info',
      systemState: 'closed',
      outcome: 'success',
    },
  ] as readonly PersonalTemplateStage[],
} as const;
