import { http, HttpResponse } from 'msw';

import { demoProjects } from '../../../../shared/mocks/data/projects.js';

export const projectsHandlers = [
  /** Список проектов; memberId — проекты сотрудника (руководит или участник —
   *  в концепте по membersPreview, полная членская связь — с бэкендом). */
  http.get('/api/v1/projects', ({ request }) => {
    const memberId = new URL(request.url).searchParams.get('memberId');
    const items = memberId
      ? demoProjects.filter(
          (p) => p.manager?.id === memberId || p.membersPreview.some((m) => m.id === memberId),
        )
      : demoProjects;
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
