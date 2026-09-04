import type { ProjectListItem } from '@nodus/contracts';

import { cid } from './chat.js';
import { isoAgo, isoDateIn } from './dates.js';
import { projectRefs } from './tasks.js';
import { userIds, userRef } from './users.js';

export const demoProjects: ProjectListItem[] = [
  {
    id: projectRefs.p1.id,
    code: 'I001',
    name: projectRefs.p1.name,
    stageName: 'Внедрение',
    manager: userRef(userIds.klimovich),
    myRole: 'manager',
    privacy: 'open',
    membersCount: 8,
    membersPreview: [
      userRef(userIds.klimovich),
      userRef(userIds.klevantovich),
      userRef(userIds.akulich),
    ],
    endDate: null,
    activityAt: isoAgo(0, 9, 30),
    channelId: null,
  },
  {
    id: projectRefs.p2.id,
    code: 'I004',
    name: projectRefs.p2.name,
    stageName: 'Разработка',
    manager: userRef(userIds.klimovich),
    myRole: 'manager',
    privacy: 'closed',
    membersCount: 4,
    membersPreview: [userRef(userIds.klimovich), userRef(userIds.akulich)],
    endDate: null,
    activityAt: isoAgo(1, 12, 0),
    channelId: null,
  },
  {
    id: projectRefs.p3.id,
    code: 'I005',
    name: projectRefs.p3.name,
    stageName: 'Внедрение',
    manager: userRef(userIds.klevantovich),
    myRole: 'member',
    privacy: 'open',
    membersCount: 12,
    membersPreview: [
      userRef(userIds.klevantovich),
      userRef(userIds.klimovich),
      userRef(userIds.matorin),
    ],
    endDate: null,
    activityAt: isoAgo(2, 8, 25),
    channelId: cid(2),
  },
  {
    id: projectRefs.p4.id,
    code: '0359',
    name: projectRefs.p4.name,
    stageName: 'Стадия Р',
    manager: userRef(userIds.vinnichek),
    myRole: 'member',
    privacy: 'closed',
    membersCount: 21,
    membersPreview: [
      userRef(userIds.akulich),
      userRef(userIds.klimovich),
      userRef(userIds.vinnichek),
      userRef(userIds.matorin),
    ],
    endDate: isoDateIn(120),
    activityAt: isoAgo(0, 11, 45),
    channelId: null,
  },
];
