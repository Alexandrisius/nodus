import { http, HttpResponse } from 'msw';

import { demoProjects } from '../../../../shared/mocks/data/projects.js';
import { counterpartyMatcher } from '../../../../shared/mocks/live-counterparty.js';

export const projectsHandlers = [
  /** Список проектов; memberId — проекты сотрудника (руководит или участник —
   *  в концепте по membersPreview, полная членская связь — с бэкендом). */
  //  clientId — проекты заказчика (вкладка «Проекты» карточки контрагента).
  http.get('/api/v1/projects', async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const memberId = params.get('memberId');
    const clientId = params.get('clientId');
    let items = memberId
      ? demoProjects.filter(
          (p) => p.manager?.id === memberId || p.membersPreview.some((m) => m.id === memberId),
        )
      : demoProjects;
    if (clientId) {
      const matches = await counterpartyMatcher(clientId, request);
      items = items.filter((p) => matches(p.client));
    }
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.get('/api/v1/projects/:id', ({ params }) => {
    const project = demoProjects.find((p) => p.id === params.id);
    if (!project)
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'Project not found' },
        { status: 404 },
      );
    return HttpResponse.json(project);
  }),

  // Задачи проекта — общий ресурс задач с фильтром (плейбук §3.1: один
  // список/канбан задач, а не два): GET /tasks?projectId= (tasks-handlers).
];
