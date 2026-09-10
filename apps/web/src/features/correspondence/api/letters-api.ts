import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLetterBody,
  LetterDetail,
  LetterListItem,
  Paginated,
  Resolution,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';

export type LettersFolder = 'unregistered' | 'incoming' | 'outgoing';

export const lettersKeys = {
  all: ['letters'] as const,
  list: (folder: LettersFolder) => [...lettersKeys.all, 'list', folder] as const,
  detail: (id: string) => [...lettersKeys.all, 'detail', id] as const,
};

export function useLettersList(folder: LettersFolder) {
  return useQuery({
    queryKey: lettersKeys.list(folder),
    queryFn: () => api<Paginated<LetterListItem>>(`/letters?folder=${folder}`),
  });
}

export function useLetterDetail(id: string) {
  return useQuery({
    queryKey: lettersKeys.detail(id),
    queryFn: () => api<LetterDetail>(`/letters/${id}`),
  });
}

/** Резолюция → поручение (поток А). Пессимистична: юридически значимое
 *  действие (вердикт владельца 2026-09-10: оптимистичность — вместе с
 *  боевым бэкендом корреспонденции). */
export function useIssueResolution(letterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api<Resolution>(`/letters/${letterId}/resolutions`, { method: 'POST', body: { text } }),
    onSuccess: () => {
      toast.success(ui.letters.resolutionDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useRegisterLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (letterId: string) =>
      api<LetterListItem>(`/letters/${letterId}/register`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(ui.letters.registerDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
    },
  });
}

/** Создание исходящего письма (почтовый клиент): оптимистично — письмо сразу
 *  встаёт в «Исходящие» и открывается карточкой; при ошибке — откат кэша. */
export function useCreateLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLetterBody) => api<LetterDetail>(`/letters`, { method: 'POST', body }),
    onSuccess: (letter) => {
      queryClient.setQueryData(lettersKeys.detail(letter.id), letter);
      toast.success(ui.letters.sendDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
    },
  });
}
