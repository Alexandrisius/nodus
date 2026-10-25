import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkCounterpartiesBody,
  ContactPerson,
  CounterpartyBulkResult,
  CounterpartyCard,
  CounterpartyListItem,
  Paginated,
  UpdateContactPersonBody,
  UpdateCounterpartyBody,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { toastApiError } from '../../../shared/api/error-toast.js';
import { counterpartiesKeys } from '../../../shared/counterparties/keys.js';

type ListPage = Paginated<CounterpartyListItem>;

/** Патч записи реестра во всех закэшированных списках (правка реквизитов). */
function patchLists(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<CounterpartyListItem>,
): void {
  queryClient.setQueriesData<ListPage>(
    { queryKey: [...counterpartiesKeys.all, 'pages'] },
    (data) =>
      data
        ? { ...data, items: data.items.map((row) => (row.id === id ? { ...row, ...patch } : row)) }
        : data,
  );
  queryClient.setQueriesData<ListPage>(
    { queryKey: [...counterpartiesKeys.all, 'options'] },
    (data) =>
      data
        ? { ...data, items: data.items.map((row) => (row.id === id ? { ...row, ...patch } : row)) }
        : data,
  );
}

/**
 * Правка реквизитов контрагента (карточка CRM): оптимистично патчим карточку
 * и строки реестра, откат снапшотом, инвалидация — после (I4). Архивная
 * запись правку не принимает (сервер 409 CRM_COUNTERPARTY_ARCHIVED).
 */
export function useUpdateCounterparty(id: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(id);
  return useMutation({
    mutationFn: (body: UpdateCounterpartyBody) =>
      api<CounterpartyCard>(`/counterparties/${id}`, { method: 'PATCH', body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: counterpartiesKeys.all });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      if (previous) queryClient.setQueryData<CounterpartyCard>(detailKey, { ...previous, ...body });
      patchLists(queryClient, id, body);
      return { previous };
    },
    onError: (error, _body, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: (card) => {
      queryClient.setQueryData(detailKey, card);
      toast.success(ui.counterparties.updatedDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Архив / возврат контрагента (идемпотентно на сервере): id — переменная,
 *  чтобы одна мутация обслуживала и карточку, и строку реестра. */
export function useSetCounterpartyArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api<CounterpartyCard>(`/counterparties/${id}/${archived ? 'archive' : 'restore'}`, {
        method: 'POST',
      }),
    onMutate: async ({ id, archived }) => {
      await queryClient.cancelQueries({ queryKey: counterpartiesKeys.all });
      const detailKey = counterpartiesKeys.detail(id);
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      const archivedAt = archived ? new Date().toISOString() : null;
      if (previous)
        queryClient.setQueryData<CounterpartyCard>(detailKey, { ...previous, archivedAt });
      patchLists(queryClient, id, { archivedAt });
      return { previous, id };
    },
    onError: (error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(counterpartiesKeys.detail(context.id), context.previous);
      }
      toastApiError(error);
    },
    onSuccess: (card) => {
      queryClient.setQueryData(counterpartiesKeys.detail(card.id), card);
      toast.success(
        card.archivedAt ? ui.counterparties.archivedDone : ui.counterparties.restoredDone,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Удаление контрагента (только без связей; связанный — 409, UI ведёт к архиву). */
export function useDeleteCounterparty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/counterparties/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(ui.counterparties.deletedDone);
    },
    onError: (error) => toastApiError(error),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Патч контактного лица в карточке (правка/архив/возврат). */
function patchContact(
  queryClient: ReturnType<typeof useQueryClient>,
  detailKey: readonly unknown[],
  contactId: string,
  patch: Partial<ContactPerson>,
): void {
  queryClient.setQueryData<CounterpartyCard>(detailKey, (data) =>
    data
      ? {
          ...data,
          contactPersons: data.contactPersons.map((person) =>
            person.id === contactId ? { ...person, ...patch } : person,
          ),
        }
      : data,
  );
}

/** Правка контактного лица (только карточка CRM): оптимистично, откат снапшотом. */
export function useUpdateContactPerson(counterpartyId: string, contactId: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(counterpartyId);
  return useMutation({
    mutationFn: (body: UpdateContactPersonBody) =>
      api<ContactPerson>(`/counterparties/${counterpartyId}/contacts/${contactId}`, {
        method: 'PATCH',
        body,
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      patchContact(queryClient, detailKey, contactId, body);
      return { previous };
    },
    onError: (error, _body, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: (contact) => {
      patchContact(queryClient, detailKey, contactId, contact);
      toast.success(ui.counterparties.contactUpdated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Удаление контактного лица (физически, из карточки). */
export function useDeleteContactPerson(counterpartyId: string, contactId: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(counterpartyId);
  return useMutation({
    mutationFn: () =>
      api<void>(`/counterparties/${counterpartyId}/contacts/${contactId}`, { method: 'DELETE' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      queryClient.setQueryData<CounterpartyCard>(detailKey, (data) =>
        data
          ? { ...data, contactPersons: data.contactPersons.filter((p) => p.id !== contactId) }
          : data,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: () => {
      toast.success(ui.counterparties.contactDeletedDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Архив / возврат контактного лица (идемпотентно на сервере). */
export function useSetContactArchived(counterpartyId: string, contactId: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(counterpartyId);
  return useMutation({
    mutationFn: (archived: boolean) =>
      api<ContactPerson>(
        `/counterparties/${counterpartyId}/contacts/${contactId}/${archived ? 'archive' : 'restore'}`,
        { method: 'POST' },
      ),
    onMutate: async (archived) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      patchContact(queryClient, detailKey, contactId, {
        archivedAt: archived ? new Date().toISOString() : null,
      });
      return { previous };
    },
    onError: (error, _archived, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: (contact) => {
      patchContact(queryClient, detailKey, contactId, contact);
      toast.success(
        contact.archivedAt
          ? ui.counterparties.contactArchivedDone
          : ui.counterparties.contactRestoredDone,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Массовый архив/возврат (островок массовых действий реестра): один запрос,
 *  результат по записи — частичный успех норма. Тост «изменено n из m». */
export function useBulkCounterparties() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkCounterpartiesBody) =>
      api<CounterpartyBulkResult>('/counterparties/bulk', { method: 'POST', body }),
    onSuccess: (result) => {
      const done = result.results.filter((row) => row.ok).length;
      const total = result.results.length;
      if (done === total) toast.success(ui.counterparties.bulkDone.replace('{n}', String(done)));
      else
        toast.warning(
          ui.counterparties.bulkPartial
            .replace('{done}', String(done))
            .replace('{total}', String(total)),
        );
    },
    onError: (error) => toastApiError(error),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}
