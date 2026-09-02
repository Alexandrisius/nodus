import { http, HttpResponse } from 'msw';

import { demoProjects } from '../../../../shared/mocks/data/projects.js';

export const projectsHandlers = [
  http.get('/api/v1/projects', () => HttpResponse.json({ items: demoProjects, nextCursor: null })),

  http.get('/api/v1/projects/:id', ({ params }) => {
    const project = demoProjects.find((p) => p.id === params.id);
    if (!project)
      return HttpResponse.json(
        { code: 'NOT_FOUND', message: 'Project not found' },
        { status: 404 },
      );
    return HttpResponse.json(project);
  }),
];
