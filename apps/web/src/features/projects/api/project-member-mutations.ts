import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProjectDetail, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../../../shared/api-client.js';
import { toastApiError } from '../../../shared/api/error-toast.js';
import { projectsKeys } from '../../../shared/api/projects-list.js';
import { useAuthStore } from '../../../shared/auth-store.js';
import { cachedUsers, patchMemberPages, userRefOf } from './project-mutation-helpers.js';

/** «Присоединиться» (открытый, не-участник) — наблюдатель-вступивший. */
export function useJoinProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/projects/${id}/join`, { method: 'POST' }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: projectsKeys.detail(id) });
      const previous = queryClient.getQueryData<ProjectDetail>(projectsKeys.detail(id));
      const me = useAuthStore.getState().user;
      if (previous && me) {
        const actor: UserRef = { id: me.id, displayName: me.displayName, avatarUrl: null };
        queryClient.setQueryData<ProjectDetail>(projectsKeys.detail(id), {
          ...previous,
          myMembership: { ...previous.myMembership, observer: true },
          membersCount: previous.membersCount + 1,
          access: { ...previous.access, canJoin: false, canLeave: true },
        });
        patchMemberPages(queryClient, id, (items) => [
          ...items.filter((row) => !(row.user.id === me.id && row.source === 'observer')),
          {
            user: actor,
            source: 'observer',
            observerKind: 'joined',
            joinedAt: new Date().toISOString(),
          },
        ]);
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(projectsKeys.detail(id), context.previous);
      void queryClient.invalidateQueries({ queryKey: projectsKeys.members(id) });
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.joinedDone),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

/** «Покинуть» — только свой ряд вступившего наблюдателя. */
export function useLeaveProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/projects/${id}/leave`, { method: 'POST' }),
    onMutate: async () => {
      const previous = queryClient.getQueryData<ProjectDetail>(projectsKeys.detail(id));
      const me = useAuthStore.getState().user;
      if (previous && me) {
        queryClient.setQueryData<ProjectDetail>(projectsKeys.detail(id), {
          ...previous,
          myMembership: { ...previous.myMembership, observer: false },
          membersCount: Math.max(previous.membersCount - 1, 0),
          access: { ...previous.access, canJoin: true, canLeave: false },
        });
        patchMemberPages(queryClient, id, (items) =>
          items.filter((row) => !(row.user.id === me.id && row.source === 'observer')),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(projectsKeys.detail(id), context.previous);
      void queryClient.invalidateQueries({ queryKey: projectsKeys.members(id) });
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.leftDone),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

/** Ручное добавление в секретный проект (участник или наблюдатель). */
export function useAddProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; kind: 'member' | 'observer' }) =>
      api<void>(`/projects/${id}/members`, { method: 'POST', body: vars }),
    onMutate: async ({ userId, kind }) => {
      const user = userRefOf(userId, cachedUsers(queryClient));
      let added = false;
      patchMemberPages(queryClient, id, (items) => {
        added = !items.some((row) => row.user.id === userId);
        const kept = items.filter(
          (row) => row.user.id !== userId || !['member', 'observer'].includes(row.source),
        );
        return [
          ...kept,
          {
            user,
            source: kind,
            observerKind: kind === 'observer' ? 'invited' : null,
            joinedAt: new Date().toISOString(),
          },
        ];
      });
      if (added) {
        queryClient.setQueryData<ProjectDetail>(projectsKeys.detail(id), (data) =>
          data ? { ...data, membersCount: data.membersCount + 1 } : data,
        );
      }
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.members(id) });
      void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(id) });
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.memberAddedDone),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

/** Снятие ручного состава секретного проекта. */
export function useRemoveProjectMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>(`/projects/${id}/members/${userId}`, { method: 'DELETE' }),
    onMutate: async (userId) => {
      let last = false;
      patchMemberPages(queryClient, id, (items) => {
        const rest = items.filter(
          (row) => !(row.user.id === userId && ['member', 'observer'].includes(row.source)),
        );
        last = rest.every((row) => row.user.id !== userId);
        return rest;
      });
      if (last) {
        queryClient.setQueryData<ProjectDetail>(projectsKeys.detail(id), (data) =>
          data ? { ...data, membersCount: Math.max(data.membersCount - 1, 0) } : data,
        );
      }
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.members(id) });
      void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(id) });
      toastApiError(error);
    },
    onSuccess: () => toast.success(ui.projects.memberRemovedDone),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });
}

/** Атрибут проекта: оптимистичная правка значения (I4). */
export function useUpdateProjectCustomField(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fieldId: string; value: unknown }) =>
      api<ProjectDetail>(`/projects/${id}`, {
        method: 'PATCH',
        body: { customFields: { [vars.fieldId]: vars.value } },
      }),
    onMutate: async ({ fieldId, value }) => {
      const previous = queryClient.getQueryData<ProjectDetail>(projectsKeys.detail(id));
      if (previous) {
        const customFields = { ...previous.customFields };
        if (value === null) delete customFields[fieldId];
        else customFields[fieldId] = value as never;
        queryClient.setQueryData<ProjectDetail>(projectsKeys.detail(id), {
          ...previous,
          customFields,
        });
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(projectsKeys.detail(id), context.previous);
      toastApiError(error);
    },
    onSuccess: (project) => queryClient.setQueryData(projectsKeys.detail(id), project),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKeys.detail(id) });
    },
  });
}
