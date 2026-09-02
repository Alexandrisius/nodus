import type { ProjectListItem } from '@nodus/contracts';

import { isoAgo, isoDateIn } from './dates.js';
import { projectRefs } from './tasks.js';
import { userIds, userRef } from './users.js';

export const demoProjects: ProjectListItem[] = [
  {
    id: projectRefs.p1.id,
    code: 'I001',
    name: projectRefs.p1.name,
    stageName: 'Внедрение',
    manager: userRef(userIds.director),
    myRole: 'manager',
    privacy: 'open',
    membersCount: 8,
    membersPreview: [
      userRef(userIds.director),
      userRef(userIds.bimLead),
      userRef(userIds.bimEngineer),
    ],
    endDate: null,
    activityAt: isoAgo(0, 9, 30),
  },
  {
    id: projectRefs.p2.id,
    code: 'I004',
    name: projectRefs.p2.name,
    stageName: 'Разработка',
    manager: userRef(userIds.director),
    myRole: 'manager',
    privacy: 'closed',
    membersCount: 4,
    membersPreview: [userRef(userIds.director), userRef(userIds.bimEngineer)],
    endDate: null,
    activityAt: isoAgo(1, 12, 0),
  },
  {
    id: projectRefs.p3.id,
    code: 'I005',
    name: projectRefs.p3.name,
    stageName: 'Внедрение',
    manager: userRef(userIds.bimLead),
    myRole: 'member',
    privacy: 'open',
    membersCount: 12,
    membersPreview: [
      userRef(userIds.bimLead),
      userRef(userIds.director),
      userRef(userIds.engineer1),
    ],
    endDate: null,
    activityAt: isoAgo(2, 8, 25),
  },
  {
    id: projectRefs.p4.id,
    code: '0359',
    name: projectRefs.p4.name,
    stageName: 'Стадия Р',
    manager: userRef(userIds.engineer2),
    myRole: 'member',
    privacy: 'closed',
    membersCount: 21,
    membersPreview: [
      userRef(userIds.engineer2),
      userRef(userIds.director),
      userRef(userIds.architect),
      userRef(userIds.engineer1),
    ],
    endDate: isoDateIn(120),
    activityAt: isoAgo(0, 11, 45),
  },
];
