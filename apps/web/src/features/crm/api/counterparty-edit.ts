import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ContactPerson,
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

/** Архив / возврат контрагента (идемпотентно на сервере). */
export function useSetCounterpartyArchived(id: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(id);
  return useMutation({
    mutationFn: (archived: boolean) =>
      api<CounterpartyCard>(`/counterparties/${id}/${archived ? 'archive' : 'restore'}`, {
        method: 'POST',
      }),
    onMutate: async (archived) => {
      await queryClient.cancelQueries({ queryKey: counterpartiesKeys.all });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      const archivedAt = archived ? new Date().toISOString() : null;
      if (previous)
        queryClient.setQueryData<CounterpartyCard>(detailKey, { ...previous, archivedAt });
      patchLists(queryClient, id, { archivedAt });
      return { previous };
    },
    onError: (error, _archived, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: (card) => {
      queryClient.setQueryData(detailKey, card);
      toast.success(
        card.archivedAt ? ui.counterparties.archivedDone : ui.counterparties.restoredDone,
      );
    },
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
