// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkflowDetail } from '@nodus/contracts';

import { createRouteDocStore } from './route-doc-store.js';

const detail = (): WorkflowDetail => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  typeIds: ['00000000-0000-4000-8000-0000000000bb'],
  version: 3,
  publishedAt: '2026-10-18T14:05:00Z',
  publishedBy: null,
  document: {
    stages: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        code: 'new',
        name: 'Ожидает',
        color: 'neutral',
        systemState: 'backlog',
        outcome: null,
        isInitial: true,
        sortOrder: 0,
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        code: 'in_progress',
        name: 'В работе',
        color: 'success',
        systemState: 'active',
        outcome: null,
        isInitial: false,
        sortOrder: 0,
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        code: 'done',
        name: 'Завершена',
        color: 'info',
        systemState: 'closed',
        outcome: 'success',
        isInitial: false,
        sortOrder: 0,
      },
    ],
    transitions: [
      {
        id: '00000000-0000-4000-8000-000000000011',
        code: 'start',
        name: 'Взять в работу',
        fromStageId: '00000000-0000-4000-8000-000000000001',
        toStageId: '00000000-0000-4000-8000-000000000002',
        display: 'primary',
        sortOrder: 0,
        rules: {
          conditions: [{ kind: 'role_in', roles: ['assignee'] }],
          validators: [],
          postFunctions: [],
        },
      },
    ],
  },
  stageTaskCounts: {},
});

function freshStore() {
  const store = createRouteDocStore('pending');
  store.getState().load(detail());
  return store;
}

describe('route-doc-store: рабочая копия маршрута (#378)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('добавление статуса и undo/redo', () => {
    const store = freshStore();
    const id = store.getState().addStage('paused');
    expect(store.getState().document.stages.some((s) => s.id === id)).toBe(true);
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().selection).toEqual({ kind: 'stage', id });

    store.getState().undo();
    expect(store.getState().document.stages.length).toBe(3);
    expect(store.getState().dirty).toBe(false);

    store.getState().redo();
    expect(store.getState().document.stages.length).toBe(4);
  });

  it('соединение портов создаёт кнопку; петля в свой статус отвергается', () => {
    const store = freshStore();
    const created = store
      .getState()
      .addTransition(
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      );
    expect(created).not.toBeNull();
    expect(store.getState().document.transitions.length).toBe(2);

    const loop = store
      .getState()
      .addTransition(
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000002',
      );
    expect(loop).toBeNull();
  });

  it('удаление статуса сносит его кнопки', () => {
    const store = freshStore();
    store.getState().removeStage('00000000-0000-4000-8000-000000000001');
    expect(store.getState().document.transitions.length).toBe(0);
  });

  it('включение начального переносит флаг с прежнего', () => {
    const store = freshStore();
    store.getState().patchStage('00000000-0000-4000-8000-000000000002', { isInitial: true });
    const initials = store.getState().document.stages.filter((s) => s.isInitial);
    expect(initials.map((s) => s.id)).toEqual(['00000000-0000-4000-8000-000000000002']);
  });

  it('setTransitionPrimary: прежняя главная статуса становится «Видна»', () => {
    const store = freshStore();
    store
      .getState()
      .addTransition(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000003',
      );
    const doc = store.getState().document;
    const newId = doc.transitions[1]!.id;
    store.getState().setTransitionPrimary(newId);
    const after = store.getState().document.transitions;
    expect(after.find((t) => t.id === newId)!.display).toBe('primary');
    expect(after.find((t) => t.code === 'start')!.display).toBe('button');
  });

  it('черновик переживает перезагрузку той же версии и сбрасывается discard', () => {
    const store = freshStore();
    store.getState().addStage('paused');
    const reloaded = createRouteDocStore('pending');
    reloaded.getState().load(detail());
    expect(reloaded.getState().document.stages.length).toBe(4);
    expect(reloaded.getState().dirty).toBe(true);

    reloaded.getState().discard();
    expect(reloaded.getState().document.stages.length).toBe(3);
    expect(reloaded.getState().dirty).toBe(false);
  });

  it('две публикации подряд: после первой документ перечитывается с сервера, new:* не повторяются', () => {
    const store = freshStore();
    const added = store.getState().addStage('paused');
    expect(added.startsWith('new:')).toBe(true);

    store.getState().markPublished();
    expect(store.getState()).toMatchObject({ pendingReload: true, dirty: false, baseVersion: 3 });
    expect(localStorage.length).toBe(0);
    // Ответ той же версии (рефетч ещё не догнал) — документ не трогаем.
    store.getState().sync(detail());
    expect(store.getState().pendingReload).toBe(true);

    // Свежая версия сервера: постоянные id вместо new:*, правки снова открыты.
    const fresh = detail();
    fresh.version = 4;
    fresh.document.stages.push({
      ...fresh.document.stages[1]!,
      id: '00000000-0000-4000-8000-000000000004',
      code: null,
      name: 'Новый статус',
      systemState: 'paused',
      color: 'neutral',
    });
    store.getState().sync(fresh);
    const state = store.getState();
    expect(state).toMatchObject({ pendingReload: false, dirty: false, baseVersion: 4 });
    expect(state.document.stages.some((s) => s.id.startsWith('new:'))).toBe(false);
    expect(state.staleDraftAt).toBeNull();

    // Вторая правка и публикация уходят от версии 4 с id сервера.
    store.getState().patchStage('00000000-0000-4000-8000-000000000004', { name: 'Ждёт ответа' });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().baseVersion).toBe(4);
  });

  it('устаревший черновик (версия ушла) не подхватывается', () => {
    const store = freshStore();
    store.getState().addStage('paused');
    const next = { ...detail(), version: 4 };
    const reloaded = createRouteDocStore('pending');
    reloaded.getState().load(next);
    expect(reloaded.getState().document.stages.length).toBe(3);
    expect(reloaded.getState().dirty).toBe(false);
  });
});
