import { z } from 'zod';
import type { WorkflowDraftDocument } from '@nodus/contracts';
import { workflowDraftDocumentSchema } from '@nodus/contracts';

/**
 * Черновик маршрута в localStorage (#378, ADR-0021): автосохранение на каждый
 * шаг документа, zod на границе rehydrate (битый/чужой — тихий null), гейт
 * версии (baseVersion) — устаревший черновик не подхватывается. Кроме
 * документа хранит ручные позиции статусов на холсте (перетаскивание —
 * раскладка редактора, в публикацию не попадает).
 */

const positionSchema = z.object({ x: z.number(), y: z.number() });

const draftEnvelopeSchema = z.object({
  document: workflowDraftDocumentSchema,
  baseVersion: z.number().int().min(1),
  savedAt: z.string(),
  positions: z.record(z.string(), positionSchema).optional(),
});

export interface DraftEnvelope {
  document: WorkflowDraftDocument;
  savedAt: string;
  positions: Record<string, { x: number; y: number }>;
}

export function draftKey(workflowId: string): string {
  return `nodus-workflow-draft-v1:${workflowId}`;
}

/** Черновик той же версии: null — нет/битый/версия ушла. */
export function readDraft(workflowId: string, version: number): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(draftKey(workflowId));
    if (!raw) return null;
    const parsed = draftEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.baseVersion !== version) return null;
    return {
      document: parsed.data.document,
      savedAt: parsed.data.savedAt,
      positions: parsed.data.positions ?? {},
    };
  } catch {
    return null;
  }
}

/** Устаревший черновик (версия ушла): когда сохранён — для баннера. */
export function readStaleDraft(workflowId: string, version: number): string | null {
  try {
    const raw = localStorage.getItem(draftKey(workflowId));
    if (!raw) return null;
    const parsed = draftEnvelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.baseVersion === version) return null;
    return parsed.data.savedAt;
  } catch {
    return null;
  }
}

export function persistDraft(
  workflowId: string,
  document: WorkflowDraftDocument,
  baseVersion: number,
  positions: Record<string, { x: number; y: number }>,
): string {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(
      draftKey(workflowId),
      JSON.stringify({ document, baseVersion, savedAt, positions }),
    );
  } catch {
    // localStorage недоступен (приватный режим) — черновик живёт в сессии.
  }
  return savedAt;
}

export function clearDraft(workflowId: string): void {
  try {
    localStorage.removeItem(draftKey(workflowId));
  } catch {
    /* noop */
  }
}
