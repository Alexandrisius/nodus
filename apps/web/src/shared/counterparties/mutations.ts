import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type {
  AddContactPersonBody,
  ContactPerson,
  CounterpartyCard,
  CounterpartyListItem,
  CreateCounterpartyBody,
  Paginated,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { toastApiError } from '../api/error-toast.js';
import { counterpartiesKeys, type CounterpartyPageParams } from './keys.js';

type ListPage = Paginated<CounterpartyListItem>;
type ListPages = InfiniteData<ListPage, string | null>;

/** Совпадает ли запись фильтру поиска (для оптимистичной вставки — только
 *  в те кэши списков, чьим параметрам запись удовлетворяет, I4/patterns). */
export function matchesCounterpartySearch(
  item: Pick<CounterpartyListItem, 'shortName' | 'fullName' | 'unp'>,
  search: string | undefined,
): boolean {
  const q = search?.trim().toLowerCase();
  if (!q) return true;
  return [item.shortName, item.fullName, item.unp ?? ''].some((value) =>
    value.toLowerCase().includes(q),
  );
}

function listItemOf(card: CounterpartyCard): CounterpartyListItem {
  return {
    id: card.id,
    fullName: card.fullName,
    shortName: card.shortName,
    unp: card.unp,
    address: card.address,
    email: card.email,
    phone: card.phone,
    lettersCount: card.lettersCount,
    projectsCount: card.projectsCount,
    contactsCount: card.contactPersons.filter((person) => person.archivedAt === null).length,
    archivedAt: card.archivedAt,
  };
}

/** Замена временной записи серверной на месте (id меняется — связка по temp). */
function replaceTemp(pages: ListPages, tempId: string, item: CounterpartyListItem): ListPages {
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((row) => (row.id === tempId ? item : row)),
    })),
  };
}

/**
 * Создание контрагента (в т.ч. «на лету» из регистрации письма и композера):
 * оптимистичная вставка в первую страницу тех кэшей реестра/подсказок, чьим
 * параметрам запись удовлетворяет (I4), откат снапшотом, серверная запись
 * заменяет временную на месте.
 */
export function useCreateCounterparty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCounterpartyBody) =>
      api<CounterpartyCard>('/counterparties', { method: 'POST', body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: counterpartiesKeys.all });
      const pagesSnapshot = queryClient.getQueriesData<ListPages>({
        queryKey: [...counterpartiesKeys.all, 'pages'],
      });
      const optionsSnapshot = queryClient.getQueriesData<ListPage>({
        queryKey: [...counterpartiesKeys.all, 'options'],
      });
      const tempId = `temp-${crypto.randomUUID()}`;
      const temp: CounterpartyListItem = {
        id: tempId,
        fullName: body.fullName,
        shortName: body.shortName,
        unp: body.unp ?? null,
        address: body.address ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        lettersCount: 0,
        projectsCount: 0,
        contactsCount: 0,
        archivedAt: null,
      };
      for (const [key, data] of pagesSnapshot) {
        const params = key[2] as CounterpartyPageParams;
        if (!data || !matchesCounterpartySearch(temp, params.search)) continue;
        queryClient.setQueryData<ListPages>(key, {
          ...data,
          pages: data.pages.map((page, index) =>
            index === 0 ? { ...page, items: [temp, ...page.items] } : page,
          ),
        });
      }
      for (const [key, data] of optionsSnapshot) {
        if (!data || !matchesCounterpartySearch(temp, key[2] as string)) continue;
        queryClient.setQueryData<ListPage>(key, { ...data, items: [temp, ...data.items] });
      }
      return { pagesSnapshot, optionsSnapshot, tempId };
    },
    onError: (error, _body, context) => {
      for (const [key, data] of context?.pagesSnapshot ?? []) queryClient.setQueryData(key, data);
      for (const [key, data] of context?.optionsSnapshot ?? []) queryClient.setQueryData(key, data);
      toastApiError(error);
    },
    onSuccess: (card, _body, context) => {
      const item = listItemOf(card);
      for (const [key] of context.pagesSnapshot) {
        queryClient.setQueryData<ListPages>(key, (data) =>
          data ? replaceTemp(data, context.tempId, item) : data,
        );
      }
      for (const [key] of context.optionsSnapshot) {
        queryClient.setQueryData<ListPage>(key, (data) =>
          data
            ? { ...data, items: data.items.map((row) => (row.id === context.tempId ? item : row)) }
            : data,
        );
      }
      queryClient.setQueryData(counterpartiesKeys.detail(card.id), card);
      toast.success(ui.counterparties.createdDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}

/** Добавление контактного лица — оптимистично (I4). */
export function useAddContactPerson(counterpartyId: string) {
  const queryClient = useQueryClient();
  const detailKey = counterpartiesKeys.detail(counterpartyId);
  return useMutation({
    mutationFn: (body: AddContactPersonBody) =>
      api<ContactPerson>(`/counterparties/${counterpartyId}/contacts`, { method: 'POST', body }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      const tempId = `temp-${crypto.randomUUID()}`;
      const temp: ContactPerson = {
        id: tempId,
        fullName: body.fullName,
        position: body.position ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        archivedAt: null,
      };
      queryClient.setQueryData<CounterpartyCard>(detailKey, (data) =>
        data ? { ...data, contactPersons: [...data.contactPersons, temp] } : data,
      );
      return { previous, tempId };
    },
    onError: (error, _body, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(detailKey, context.previous);
      toastApiError(error);
    },
    onSuccess: (contact, _body, context) => {
      queryClient.setQueryData<CounterpartyCard>(detailKey, (data) =>
        data
          ? {
              ...data,
              contactPersons: data.contactPersons.map((person) =>
                person.id === context.tempId ? contact : person,
              ),
            }
          : data,
      );
      toast.success(ui.counterparties.contactAdded);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
    },
  });
}
