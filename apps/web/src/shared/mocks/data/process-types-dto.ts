import type { ProcessType } from '@nodus/contracts';
import { typeAccessFor } from '@nodus/contracts';

import { demoCustomFieldDefinitions } from './custom-fields.js';
import { mockEffectiveRoleIds, mockIsAdmin } from './roles.js';
import { demoUserListItems } from './users.js';
import { getMockActor } from '../mock-actor.js';
import { creationFormOf, type DemoProcessType } from './process-types-store.js';

/** DTO типа процесса под текущего актёра (#432, Р6): видимость и создание по
 *  ролям, форма создания, конфигурация; факты проверки документа маршрута. */

/** DTO типа под текущего актёра (Р6): доступ по ролям, форма, конфигурация. */
export function typeDto(type: DemoProcessType): ProcessType {
  const actor = getMockActor();
  const viewer = typeAccessFor(
    { config: type.config, creatable: type.creatable },
    { roleIds: mockEffectiveRoleIds(actor.id), isAdmin: mockIsAdmin(actor.id) },
  );
  return { ...structuredClone(type), creationForm: creationFormOf(type), viewer };
}

/** Видимость типа для актёра: без `workflow.manage` — только видимые (Р6). */
export function canSeeAllTypes(): boolean {
  return getMockActor().permissions.includes('workflow.manage');
}

/** Факты проверки документа: атрибуты области и привязка к типу (Р8). */
export function documentFacts(type: DemoProcessType | undefined, category: string) {
  const scope = category === 'letter' ? 'letter' : 'task';
  const scoped = demoCustomFieldDefinitions.filter((entry) => entry.scope === scope);
  const inType = new Set(
    scoped.filter((entry) => type && entry.typeIds.includes(type.id)).map((entry) => entry.id),
  );
  return {
    customFields: {
      active: new Set(scoped.map((entry) => entry.id)),
      hidden: new Set(scoped.filter((entry) => entry.hidden).map((entry) => entry.id)),
      inType,
    },
    category: scope,
    definitions: scoped.map((entry) => ({
      id: entry.id,
      type: entry.type,
      settings: entry.settings,
      hidden: entry.hidden,
    })),
    projectsAvailable: true,
    activeUserIds: new Set(
      demoUserListItems.filter((user) => user.status === 'active').map((user) => user.id),
    ),
  } as const;
}
