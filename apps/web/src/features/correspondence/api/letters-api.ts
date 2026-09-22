import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLetterBody,
  DocumentKind,
  IssueResolutionBody,
  LetterDetail,
  LetterListItem,
  Mailbox,
  Paginated,
  RegisterLetterBody,
  Resolution,
} from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { toastApiError } from '../../../shared/api/error-toast.js';
import { useLettersList } from '../../../shared/api/letters-list.js';
import { counterpartiesKeys } from '../../../shared/counterparties/api.js';
import { homeKeys } from '../../../shared/api/home-keys.js';
import { lettersKeys } from '../../../shared/api/letters-keys.js';
import { tasksKeys } from '../../../shared/api/tasks-keys.js';

export { lettersKeys, useLettersList };
export type { LettersFolder } from '../../../shared/api/letters-list.js';

/** Переменная создания исходящего: тело + витринные снапшоты для
 *  оптимистичной вставки (клиент знает их из комбобокса/ящика). */
export interface CreateLetterVars {
  body: CreateLetterBody;
  counterpartyName: string;
  mailbox: Mailbox;
}

export function useMailboxes() {
  return useQuery({
    queryKey: [...lettersKeys.all, 'mailboxes'],
    queryFn: () => api<Mailbox[]>('/mailboxes'),
  });
}

/** Словарь «вид документа» (dictionaries, сид #54): ключ shared-стиля
 *  (образец usersListKey) — потребитель один, но словарь общий домена. */
export const documentKindsKey = ['dictionaries', 'document-kinds'] as const;

export function useDocumentKinds() {
  return useQuery({
    queryKey: documentKindsKey,
    queryFn: () => api<DocumentKind[]>('/dictionaries/document-kinds'),
  });
}

/** Ключ списка «Отправленные» без фильтра контрагента — целевой кэш
 *  оптимистичной вставки useCreateLetter (совпадает с shared useLettersList). */
const outgoingListKey = [...lettersKeys.list('outgoing'), null] as const;

export function useLetterDetail(id: string) {
  return useQuery({
    queryKey: lettersKeys.detail(id),
    queryFn: () => api<LetterDetail>(`/letters/${id}`),
  });
}

/** Целевое письмо связи «ответ на» (inReplyToId): условный запрос —
 *  у большинства писем исходника нет. */
export function useLetterReplyTarget(id: string | null | undefined) {
  return useQuery({
    queryKey: lettersKeys.detail(id ?? ''),
    queryFn: () => api<LetterDetail>(`/letters/${id}`),
    enabled: Boolean(id),
  });
}

/** Регистрация письма (карточка регистрации). Пессимистична: юридически
 *  значимое действие — рег.№ присваивает сервер, повторная регистрация
 *  невозможна (обоснование — README фичи). */
export function useRegisterLetter(letterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterLetterBody) =>
      api<LetterDetail>(`/letters/${letterId}/register`, { method: 'POST', body }),
    onSuccess: (letter) => {
      queryClient.setQueryData(lettersKeys.detail(letter.id), letter);
      toast.success(ui.letters.registerDone);
    },
    onError: toastApiError,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
      // Счётчики писем в реестре контрагентов зависят от регистраций.
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
      // Бейдж очереди «К регистрации» и недавние документы на главной.
      void queryClient.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}

/** Резолюция → 1..N поручений-задач (поток А). Пессимистична: юридически
 *  значимое действие (задачи создаёт сервер, номера поручений авторитетны). */
export function useIssueResolution(letterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueResolutionBody) =>
      api<Resolution>(`/letters/${letterId}/resolutions`, { method: 'POST', body }),
    onSuccess: () => {
      toast.success(ui.letters.resolutionDone);
    },
    onError: toastApiError,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
      void queryClient.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

/** «В дело» — финал документа (только из «исполнено»). Пессимистична:
 *  юридически значимое перемещение в архив канцелярии. */
export function useArchiveLetter(letterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<LetterDetail>(`/letters/${letterId}/archive`, { method: 'POST' }),
    onSuccess: (letter) => {
      queryClient.setQueryData(lettersKeys.detail(letter.id), letter);
      toast.success(ui.letters.archiveDone);
    },
    onError: toastApiError,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
      void queryClient.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}

/** Создание исходящего письма: «просто письмо» — ОПТИМИСТИЧНО (I4: письмо
 *  сразу встаёт в «Отправленные»); исходящий ДОКУМЕНТ — пессимистично
 *  (рег.№ Исх присваивает сервер при отправке — юридически значимо,
 *  оптимистичный номер был бы выдуманным). */
export function useCreateLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateLetterVars) =>
      api<LetterDetail>('/letters', { method: 'POST', body: vars.body }),
    onMutate: async (vars) => {
      if (vars.body.asDocument) return undefined;
      await queryClient.cancelQueries({ queryKey: outgoingListKey });
      const previous = queryClient.getQueryData<Paginated<LetterListItem>>(outgoingListKey);
      const tempId = `temp-${crypto.randomUUID()}`;
      const temp: LetterListItem = {
        id: tempId,
        type: 'outgoing',
        receiveChannel: vars.body.receiveChannel,
        mailbox: vars.mailbox,
        counterparty: { id: vars.body.counterpartyId, name: vars.counterpartyName },
        subject: vars.body.subject,
        recipients: [],
        cc: [],
        date: new Date().toISOString(),
        registration: null,
        documentStatus: null,
        inReplyToId: vars.body.inReplyToId,
      };
      queryClient.setQueryData<Paginated<LetterListItem>>(outgoingListKey, (data) =>
        data ? { ...data, items: [temp, ...data.items] } : data,
      );
      return { previous, tempId };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(outgoingListKey, context.previous);
      }
      toast.error(ui.common.sendError);
    },
    onSuccess: (letter, _vars, context) => {
      if (context?.tempId) {
        queryClient.setQueryData<Paginated<LetterListItem>>(outgoingListKey, (data) =>
          data
            ? { ...data, items: data.items.map((l) => (l.id === context.tempId ? letter : l)) }
            : data,
        );
      }
      queryClient.setQueryData(lettersKeys.detail(letter.id), letter);
      toast.success(ui.letters.sendDone);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lettersKeys.all });
      void queryClient.invalidateQueries({ queryKey: counterpartiesKeys.all });
      void queryClient.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
