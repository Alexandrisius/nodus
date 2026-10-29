import type { ProjectHistoryKind, ProjectStatus } from '@nodus/contracts';

import { isoAgo } from './dates.js';
import { demoProjectRows } from './projects.js';
import { projectRefs } from './task-item-factory.js';
import { userIds } from './users.js';

/** Событие истории мок-мира (зеркало outbox `project.*`, I9). */
export interface DemoProjectEvent {
  id: string;
  projectId: string;
  kind: ProjectHistoryKind;
  actorId: string | null;
  createdAt: string;
  fields: string[];
  status: ProjectStatus | null;
  userIds: string[];
  name: string | null;
}

/** Журнал событий: у каждого демо-проекта — создание, у первого ещё состав
 *  и статус (вкладка «История» не пустует до первых живых действий). */
export const demoProjectEvents: DemoProjectEvent[] = [
  ...demoProjectRows.map((project): DemoProjectEvent => ({
    id: `demo-event-created-${project.id}`,
    projectId: project.id,
    kind: 'created',
    actorId: project.creatorId,
    createdAt: project.createdAt,
    fields: [],
    status: null,
    userIds: [],
    name: project.name,
  })),
  {
    id: 'demo-event-p1-members',
    projectId: projectRefs.p1.id,
    kind: 'participants_changed',
    actorId: userIds.klimovich,
    createdAt: isoAgo(5, 14, 10),
    fields: [],
    status: null,
    userIds: [userIds.voronina],
    name: null,
  },
  {
    id: 'demo-event-p1-updated',
    projectId: projectRefs.p1.id,
    kind: 'updated',
    actorId: userIds.klevantovich,
    createdAt: isoAgo(3, 9, 20),
    fields: ['description', 'endDate'],
    status: null,
    userIds: [],
    name: null,
  },
];

export function appendDemoProjectEvent(event: Omit<DemoProjectEvent, 'id' | 'createdAt'>): void {
  demoProjectEvents.push({
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}
