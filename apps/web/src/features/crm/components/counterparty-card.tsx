import { Archive, Building2, Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nodus/ui/components/dialog';
import { NodeChip } from '@nodus/ui/components/node-chip';
import { Skeleton } from '@nodus/ui/components/skeleton';

import { useCounterpartyCard } from '../../../shared/counterparties/queries.js';
import { useCanManageCounterparties } from '../../../shared/counterparties/use-crm-permissions.js';
import { useSetCounterpartyArchived } from '../api/counterparty-edit.js';
import { ContactPersonsPanel } from './contact-persons.js';
import { CounterpartyFormDialog } from './counterparty-form-dialog.js';
import { CounterpartyRelated } from './counterparty-related.js';
import { CounterpartyRequisites } from './counterparty-requisites.js';

function CardSkeleton() {
  return (
    <div className="content-fade flex h-full flex-col gap-4 overflow-y-auto p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-32 w-full max-w-2xl" />
    </div>
  );
}

/** Состояние «не найден / нет доступа»: архив не отдаётся только при
 *  выключенном модуле или устаревшей ссылке — вечного скелетона нет (Д2). */
function CardNotFound() {
  return (
    <div className="content-fade flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Building2 className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">{ui.counterparties.notFound}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{ui.counterparties.notFoundHint}</p>
    </div>
  );
}

/** Действия карточки — нижний бар h-16, кнопки СЛЕВА (анатомия карточки
 *  письма/задачи); право `crm.manage` (сервер — истина, I8). */
function CardBottomBar({
  counterpartyId,
  archived,
}: {
  counterpartyId: string;
  archived: boolean;
}) {
  const canManage = useCanManageCounterparties();
  const setArchived = useSetCounterpartyArchived(counterpartyId);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: card } = useCounterpartyCard(counterpartyId);
  if (!canManage) {
    return archived ? (
      <span className="text-xs text-muted-foreground">{ui.counterparties.archivedHint}</span>
    ) : null;
  }

  return (
    <>
      {archived ? (
        <Button
          size="sm"
          variant="outline"
          disabled={setArchived.isPending}
          onClick={() => setArchived.mutate(false)}
        >
          <RotateCcw data-icon="inline-start" />
          {ui.counterparties.restore}
        </Button>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil data-icon="inline-start" />
            {ui.counterparties.edit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setConfirmOpen(true)}
          >
            <Archive data-icon="inline-start" />
            {ui.counterparties.archive}
          </Button>
        </>
      )}
      {archived ? (
        <span className="ml-2 min-w-0 truncate text-xs text-muted-foreground">
          {ui.counterparties.archivedHint}
        </span>
      ) : null}

      <CounterpartyFormDialog open={editOpen} onOpenChange={setEditOpen} card={card ?? null} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ui.counterparties.archiveConfirmTitle}</DialogTitle>
            <DialogDescription>{ui.counterparties.archiveConfirmText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {ui.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={setArchived.isPending}
              onClick={() => setArchived.mutate(true, { onSuccess: () => setConfirmOpen(false) })}
            >
              {ui.counterparties.archive}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Карточка контрагента (стек, ADR-0009) — анатомия карточки письма/задачи
 * (вердикт владельца 25.10.2026): ЛЕВАЯ зона — данные (реквизиты реестром
 * полей, связанные письма и проекты при непустых счётчиках) и нижний бар h-16
 * с действиями СЛЕВА; ПРАВАЯ колонка — панель данных «Контакты» (как чат у
 * письма: полновысотная, своя шапка с линией бара, своя прокрутка).
 * Состояния: загрузка, «не найден / нет доступа», архивная карточка
 * (read-only + «Вернуть из архива»).
 */
export function CounterpartyCard({ counterpartyId }: { counterpartyId: string }) {
  const { data: card, isLoading } = useCounterpartyCard(counterpartyId);
  const canManage = useCanManageCounterparties();

  if (isLoading) return <CardSkeleton />;
  if (!card) return <CardNotFound />;
  const archived = card.archivedAt !== null;

  return (
    <div className="flex h-full min-w-0">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div
          className="relative grid min-h-0 flex-1"
          style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}
        >
          <div className="relative flex min-h-0 flex-col border-r border-border @container">
            <div className="content-fade min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-3xl">
                <div className="flex items-start gap-3">
                  <span className="node-panel flex size-10 shrink-0 items-center justify-center">
                    <Building2 className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-foreground">{card.shortName}</h2>
                      {archived ? (
                        <NodeChip tone="muted">{ui.counterparties.archivedBadge}</NodeChip>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{card.fullName}</div>
                  </div>
                </div>

                <CounterpartyRequisites card={card} />
                <CounterpartyRelated card={card} />
              </div>
            </div>

            {/* Нижний бар — только когда есть действия (или пояснение в
                архиве): пустая полоса у сотрудника без прав — мусор. */}
            {canManage || archived ? (
              <div className="flex h-16 shrink-0 items-center gap-2 border-t border-border px-5">
                <CardBottomBar counterpartyId={card.id} archived={archived} />
              </div>
            ) : null}
          </div>

          <ContactPersonsPanel
            counterpartyId={card.id}
            contacts={card.contactPersons}
            readOnly={archived}
          />
        </div>
      </div>
    </div>
  );
}
