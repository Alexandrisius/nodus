import { describe, expect, it } from 'vitest';

import { projectKanbanFeedUrl, projectTaskFeedUrl } from './projects-api.js';

/** F-A (#467): дерево и проектный канбан обязаны запрашивать ВСЕ задачи
 *  проекта (`scope=all`), иначе видны только задачи смотрящего. */
describe('фиды задач проекта — scope=all', () => {
  it('лента задач проекта: scope=all и курсор', () => {
    expect(projectTaskFeedUrl('p-1', null)).toBe('/tasks?projectId=p-1&scope=all&limit=100');
    expect(projectTaskFeedUrl('p-1', 'c-1')).toBe(
      '/tasks?projectId=p-1&scope=all&limit=100&cursor=c-1',
    );
  });

  it('колонка проектного канбана: scope=all', () => {
    expect(projectKanbanFeedUrl('p-1', 's-1', null, 50)).toBe(
      '/tasks?stageId=s-1&projectId=p-1&scope=all&limit=50',
    );
    expect(projectKanbanFeedUrl('p-1', 's-1', 'c-1', 50)).toBe(
      '/tasks?stageId=s-1&projectId=p-1&scope=all&limit=50&cursor=c-1',
    );
  });
});
