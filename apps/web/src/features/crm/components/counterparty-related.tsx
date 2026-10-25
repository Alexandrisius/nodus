import type { CounterpartyCard } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeLabel } from '@nodus/ui/components/node-label';

import { useOpenCard } from '../../../app/shell/use-card-stack.js';
import { useLettersList } from '../../../shared/api/letters-list.js';
import { useProjectsList } from '../../../shared/api/projects-list.js';
import { formatDate } from '../../../shared/lib/format.js';
import { ProjectIdentityIcon } from '../../../shared/ui/project-identity-icon.js';

/**
 * Связанные письма и проекты контрагента (#460): блок запрашивается ТОЛЬКО
 * при непустом счётчике — пока модулей писем (#55) и проектов (#52) нет,
 * счётчики нулевые и запросов к несуществующим API не происходит (в живом
 * режиме это были бы 404 в консоли). Фильтр проектов по заказчику — пока
 * клиентский по первой странице; `?customerId=` придёт с #52.
 */
export function CounterpartyRelated({ card }: { card: CounterpartyCard }) {
  const openCard = useOpenCard();
  const { data: letters } = useLettersList(undefined, card.id, {
    enabled: card.lettersCount > 0,
  });
  const { data: projects } = useProjectsList({ enabled: card.projectsCount > 0 });
  const relatedProjects = (projects?.items ?? []).filter((p) => p.client?.id === card.id);

  if (card.lettersCount === 0 && card.projectsCount === 0) return null;

  return (
    <>
      {card.lettersCount > 0 ? (
        <section className="mt-8">
          <NodeLabel label={ui.counterparties.relatedLetters} count={card.lettersCount} />
          <div className="mt-2.5 flex flex-col gap-1.5">
            {(letters?.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{ui.counterparties.noLetters}</p>
            ) : null}
            {(letters?.items ?? []).map((letter) => (
              <button
                key={letter.id}
                type="button"
                onClick={() => openCard({ kind: 'letter', id: letter.id })}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50"
              >
                <span className="w-24 shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                  {letter.registration?.regNumber ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate">{letter.subject}</span>
                <span className="shrink-0 font-mono text-label-sm text-muted-foreground tabular-nums">
                  {formatDate(letter.date)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {card.projectsCount > 0 ? (
        <section className="mt-8">
          <NodeLabel label={ui.counterparties.relatedProjects} count={card.projectsCount} />
          <div className="mt-2.5 flex flex-col gap-1.5">
            {relatedProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ui.counterparties.noProjects}</p>
            ) : null}
            {relatedProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openCard({ kind: 'project', id: project.id })}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/50"
              >
                <ProjectIdentityIcon color={project.color} />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
