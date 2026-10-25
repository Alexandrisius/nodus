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
import { Skeleton } from '@nodus/ui/components/skeleton';

import { ApiError } from '../../../shared/api-client.js';
import { useCounterpartyCard } from '../../../shared/counterparties/queries.js';
import { useCanManageCounterparties } from '../../../shared/counterparties/use-crm-permissions.js';
import { useSetCounterpartyArchived } from '../api/counterparty-edit.js';
import { ContactPersons } from './contact-persons.js';
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

/** Действия шапки карточки: правка, архив/возврат (право `crm.manage`). */
function CardActions({ counterpartyId, archived }: { counterpartyId: string; archived: boolean }) {
  const canManage = useCanManageCounterparties();
  const setArchived = useSetCounterpartyArchived(counterpartyId);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: card } = useCounterpartyCard(counterpartyId);
  if (!canManage) return null;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
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
      </div>

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
 * Карточка контрагента (стек, ADR-0009): реквизиты (реестр полей с настройкой
 * видимости), контактные лица (добавление/правка/архив), связанные письма и
 * проекты — только при непустых счётчиках (#460). Состояния: загрузка,
 * «не найден / нет доступа», архивная карточка (read-only + «Вернуть из
 * архива»), действия правки — по праву `crm.manage` (сервер — истина, I8).
 */
export function CounterpartyCard({ counterpartyId }: { counterpartyId: string }) {
  const { data: card, isLoading, error } = useCounterpartyCard(counterpartyId);

  if (isLoading) return <CardSkeleton />;
  if (!card) {
    if (error instanceof ApiError && error.status === 404) return <CardNotFound />;
    return <CardNotFound />;
  }
  const archived = card.archivedAt !== null;

  return (
    <div className="content-fade h-full overflow-y-auto">
      <div className="@container mx-auto w-full max-w-4xl p-6">
        <div className="flex items-start gap-3">
          <span className="node-panel flex size-10 shrink-0 items-center justify-center">
            <Building2 className="size-4.5 text-muted-foreground" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{card.shortName}</h2>
              {archived ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-label-sm text-muted-foreground">
                  {ui.counterparties.archivedBadge}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">{card.fullName}</div>
            {archived ? (
              <p className="mt-1 text-xs text-muted-foreground">{ui.counterparties.archivedHint}</p>
            ) : null}
          </div>
          <CardActions counterpartyId={card.id} archived={archived} />
        </div>

        <CounterpartyRequisites card={card} />
        <ContactPersons
          counterpartyId={card.id}
          contacts={card.contactPersons}
          readOnly={archived}
        />
        <CounterpartyRelated card={card} />
      </div>
    </div>
  );
}
