import type { CustomFieldValue, ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { CustomFieldsBlock } from '../../../shared/custom-fields/custom-fields-block.js';
import { EntityFields } from '../../../shared/ui/entity-fields.js';
import { ProjectIdentityIcon } from '../../../shared/ui/project-identity-icon.js';
import {
  ProjectStatusChip,
  ProjectVisibilityChip,
} from '../../../shared/views/project-table-fields.js';
import { useUpdateProjectCustomField } from '../api/project-member-mutations.js';
import { projectPassportDefs } from '../lib/project-passport.js';

/**
 * ЛЕВАЯ панель карточки проекта — «О проекте» (вердикт владельца 07.11.2026:
 * главная панель без вкладки, рабочая зона — справа). Сверху идентичность
 * (плитка цвета, название, шифр, тип, портфель, статус и видимость — они
 * больше не дублируются в паспорте), затем описание, паспорт полей-реестром
 * (ссылки на сотрудников/контрагента — карточками стека) и «Атрибуты»
 * области `project` (правка по месту для руководства). Действия проекта —
 * в нижнем баре панели (`ProjectActionBar`), как в задачах и письмах.
 */
export function ProjectAboutPanel({ project }: { project: ProjectDetail }) {
  const openCard = useOpenCard();
  const updateField = useUpdateProjectCustomField(project.id);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start gap-3">
          <ProjectIdentityIcon color={project.color} className="mt-0.5 size-9 rounded-lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-balance text-foreground">{project.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-label-sm text-foreground/80 tabular-nums">
                {project.code ?? ui.projects.noCode}
              </span>
              {project.type ? <span>· {project.type.name}</span> : null}
              {project.portfolio ? <span>· {project.portfolio.name}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ProjectStatusChip project={project} />
              <ProjectVisibilityChip project={project} />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <NodeLabel label={ui.projects.fieldDescription} />
          <p className="mt-1 text-sm whitespace-pre-wrap text-foreground">
            {project.description || (
              <span className="text-muted-foreground">{ui.common.notSet}</span>
            )}
          </p>
        </div>

        <EntityFields
          defs={projectPassportDefs(project, openCard)}
          storageKey="nodus-project-fields-v2"
        />

        <CustomFieldsBlock
          scope="project"
          values={project.customFields}
          refs={project.customFieldRefs}
          canEdit={project.access.canManage}
          onChange={(fieldId, value: CustomFieldValue | null) =>
            updateField.mutate({ fieldId, value })
          }
        />
      </div>
    </div>
  );
}
