import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkflowDetail, WorkflowLayout } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { workflowKeys } from '../../../shared/workflow/workflow-api.js';
import { saveWorkflowLayout } from '../api/automation-api.js';
import { layoutFingerprint, persistedLayout } from './route-doc-layout.js';
import { useRouteDocStore } from './route-doc-store.js';

/** Тишина после последнего движения до отправки. */
const DEBOUNCE_MS = 600;

const flushers = new Map<string, () => Promise<void>>();

/** Отправить несохранённую расстановку сразу — перед публикацией: места уже
 *  стоящих элементов сервер берёт из сохранённой раскладки. */
export function flushLayoutAutosave(workflowId: string): Promise<void> {
  return flushers.get(workflowId)?.() ?? Promise.resolve();
}

/**
 * Автосохранение расстановки холста (#378 ред. 2, вердикт владельца 20.10):
 * перестановка статусов, стрелок и подписей — оформление, а не правка
 * маршрута: без черновика и без новой версии, сразу на сервер (PUT
 * .../layout) после короткой тишины. Уходят места опубликованных элементов,
 * места новых — вместе с их публикацией. Смена типа и уход со страницы
 * отправляют несохранённое сразу; не успело уйти (закрыли вкладку) — черновик
 * в браузере держит расстановку, и при следующем открытии она уйдёт сама.
 */
export function useLayoutAutosave(workflowId: string, enabled: boolean): void {
  const queryClient = useQueryClient();
  const layout = useRouteDocStore((s) => s.document.layout);
  const saved = useRouteDocStore((s) => s.baseline.layout);
  const pending = useRef<WorkflowLayout | null>(null);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    try {
      const result = await saveWorkflowLayout(workflowId, next);
      const store = useRouteDocStore.getState();
      if (store.workflowId === workflowId) store.markLayoutSaved(result.layout);
      queryClient.setQueryData<WorkflowDetail>(workflowKeys.detail(workflowId), (old) =>
        old ? { ...old, document: { ...old.document, layout: result.layout } } : old,
      );
    } catch {
      toast.error(ui.automation.layoutSaveFailed);
    }
  }, [workflowId, queryClient]);

  /** Несохранённое из стора прямо сейчас (null — всё сохранено). */
  const unsaved = useCallback((): WorkflowLayout | null => {
    const store = useRouteDocStore.getState();
    if (store.workflowId !== workflowId) return null;
    const next = persistedLayout(store.document, store.baseline);
    return layoutFingerprint(next) === layoutFingerprint(store.baseline.layout) ? null : next;
  }, [workflowId]);

  useEffect(() => {
    if (!enabled) return;
    pending.current = unsaved();
    if (!pending.current) return;
    const timer = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [layout, saved, enabled, unsaved, flush]);

  useEffect(() => {
    if (!enabled) return;
    const flushNow = async () => {
      pending.current = unsaved();
      await flush();
    };
    flushers.set(workflowId, flushNow);
    return () => {
      if (flushers.get(workflowId) === flushNow) flushers.delete(workflowId);
    };
  }, [enabled, workflowId, unsaved, flush]);

  // Смена маршрута или уход со страницы — несохранённое уходит сразу.
  useEffect(() => () => void flush(), [flush]);
}
