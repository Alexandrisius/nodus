/**
 * Read-порт задач для модуля проектов (ADR-0012, #52 Р11): проекция
 * участия «из задач» (Р2) пересчитывается по событиям task.*, а истину о
 * составе живых задач знает только владелец данных. Модуль projects читает
 * состав через этот порт, не трогая таблицы задач (I3/I6). Провайдер —
 * рядом, экспорт — TasksPortsModule.
 */
export const TASK_PROJECT_READER = Symbol('TASK_PROJECT_READER');

export interface TaskProjectReader {
  /** Действующие участники задач проекта БЕЗ наблюдателей (Р2, вердикт
   *  29.10): постановщик, ответственный, соисполнители живых задач;
   *  уникальные id. Пустой массив — задач нет. */
  membersOf(projectId: string): Promise<string[]>;

  /** projectId живой задачи; null — задачи нет (или удалена). */
  projectIdOf(taskId: string): Promise<string | null>;
}
