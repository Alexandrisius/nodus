import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** API справочника контрагентов — в shared (образец: shared/chat/api.ts):
 *  потребители — фича контрагентов И корреспонденция (автокомплит
 *  регистрации/композера); cross-feature импорт запрещён (I6). */
export const counterpartiesKeys = {
  all: ['counterparties'] as const,
  list: (search?: string) => [...counterpartiesKeys.all, 'list', search ?? null] as const,
  detail: (id: string) => [...counterpartiesKeys.all, 'detail', id] as const,
};

export function useCounterpartiesList(search?: string) {
  return useQuery({
    queryKey: counterpartiesKeys.list(search),
    queryFn: () =>
      api<Paginated<CounterpartyListItem>>(
        `/counterparties${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });
}

export function useCounterpartyCard(id: string) {
  return useQuery({
    queryKey: counterpartiesKeys.detail(id),
    queryFn: () => api<CounterpartyCard>(`/counterparties/${id}`),
  });
}

/** Создание контрагента (в т.ч. «на лету» из автокомплита): оптимистичная
 *  вставка в реестр (I4), реальный id возвращается из onSuccess — форма
 *  регистрации подхватывает его для отправки письма. */
export function useCreateCounterparty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCounterpartyBody) =>
      api<CounterpartyCard>('/counterparties', { method: 'POST', body }),
    onMutate: async (body) => {
      const listKey = counterpartiesKeys.list();
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Paginated<CounterpartyListItem>>(listKey);
      const tempId = `temp-${crypto.randomUUID()}`;
      const temp: CounterpartyListItem = {
        id: tempId,
        fullName: body.fullName,
        shortName: body.shortName,
        unp: body.unp,
        lettersCount: 0,
        projectsCount: 0,
        contactsCount: 0,
      };
      queryClient.setQueryData<Paginated<CounterpartyListItem>>(listKey, (data) =>
        data ? { ...data, items: [temp, ...data.items] } : data,
      );
      return { previous, tempId };
    },
    onError: (_error, _body, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(counterpartiesKeys.list(), context.previous);
      }
      toast.error(ui.common.sendError);
    },
    onSuccess: (card, _body, context) => {
      const listKey = counterpartiesKeys.list();
      if (context?.tempId) {
        queryClient.setQueryData<Paginated<CounterpartyListItem>>(listKey, (data) =>
          data
            ? {
                ...data,
                items: data.items.map((c) =>
                  c.id === context.tempId
                    ? { ...card, lettersCount: 0, projectsCount: 0, contactsCount: 0 }
                    : c,
                ),
              }
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
  return useMutation({
    mutationFn: (body: AddContactPersonBody) =>
      api<ContactPerson>(`/counterparties/${counterpartyId}/contacts`, { method: 'POST', body }),
    onMutate: async (body) => {
      const detailKey = counterpartiesKeys.detail(counterpartyId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<CounterpartyCard>(detailKey);
      const temp: ContactPerson = { id: `temp-${crypto.randomUUID()}`, ...body };
      queryClient.setQueryData<CounterpartyCard>(detailKey, (data) =>
        data ? { ...data, contactPersons: [...data.contactPersons, temp] } : data,
      );
      return { previous, tempId: temp.id };
    },
    onError: (_error, _body, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(counterpartiesKeys.detail(counterpartyId), context.previous);
      }
      toast.error(ui.common.sendError);
    },
    onSuccess: (contact, _body, context) => {
      queryClient.setQueryData<CounterpartyCard>(
        counterpartiesKeys.detail(counterpartyId),
        (data) =>
          data
            ? {
                ...data,
                contactPersons: data.contactPersons.map((p) =>
                  p.id === context?.tempId ? contact : p,
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
