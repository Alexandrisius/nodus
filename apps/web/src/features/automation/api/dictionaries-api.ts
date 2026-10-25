import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDictionaryBody,
  CreateDictionaryItemBody,
  Dictionary,
  DictionaryItem,
  ReorderDictionaryItemsBody,
  UpdateDictionaryItemBody,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { dictionariesKeys } from '../../../shared/dictionaries/keys.js';

/** Минимальная запись справочников (#431, Р10): варианты списков живут
 *  данными (I15), веб композирует API двух модулей, как «Автоматизация». */
function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: dictionariesKeys.all });
}

export function useCreateDictionary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDictionaryBody) =>
      api<Dictionary>('/dictionaries', { method: 'POST', body }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCreateDictionaryItem(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDictionaryItemBody) =>
      api<DictionaryItem>(`/dictionaries/${encodeURIComponent(code)}/items`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

/** Переименование варианта: подпись меняется во всех полях с этим списком. */
export function useUpdateDictionaryItem(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UpdateDictionaryItemBody }) =>
      api<DictionaryItem>(`/dictionaries/${encodeURIComponent(code)}/items/${vars.id}`, {
        method: 'PATCH',
        body: vars.body,
      }),
    onSuccess: () => invalidate(queryClient),
    onError: () => toast.error(ui.common.saveError),
  });
}

export function useReorderDictionaryItems(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReorderDictionaryItemsBody) =>
      api<void>(`/dictionaries/${encodeURIComponent(code)}/items/order`, {
        method: 'PUT',
        body,
      }),
    onSuccess: () => invalidate(queryClient),
    onError: () => toast.error(ui.common.saveError),
  });
}

/** Архив и возврат варианта: архивный остаётся читаемым для старых
 *  значений, но не предлагается в новых (I15). */
export function useArchiveDictionaryItem(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; archived: boolean }) =>
      api<DictionaryItem>(
        `/dictionaries/${encodeURIComponent(code)}/items/${vars.id}/${vars.archived ? 'archive' : 'restore'}`,
        { method: 'POST' },
      ),
    onSuccess: () => invalidate(queryClient),
    onError: () => toast.error(ui.common.saveError),
  });
}
