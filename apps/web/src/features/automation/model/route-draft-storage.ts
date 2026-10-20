import { z } from 'zod';
import type { WorkflowDraftDocument } from '@nodus/contracts';
import { workflowDraftDocumentSchema } from '@nodus/contracts';

/**
 * Черновик маршрута в localStorage (#378, ADR-0021): автосохранение на каждый
 * шаг документа, zod на границе rehydrate (битый/чужой — тихий null), гейт
 * версии (baseVersion) — устаревший черновик не подхватывается. Раскладка
 * холста — часть документа (`document.layout`, ред. 2): ключ v2. Черновики
 * v1 хранили ручные позиции отдельно (`positions`) — при чтении переносятся
 * в `layout.stages`, ключ v1 снимается.
 */

const positionSchema = z.object({ x: z.number(), y: z.number() });

const draftEnvelopeSchema = z.object({
  document: workflowDraftDocumentSchema,
  baseVersion: z.number().int().min(1),
  savedAt: z.string(),
  /** Только v1: позиции статусов вне документа. */
  positions: z.record(z.string(), positionSchema).optional(),
});

type Envelope = z.infer<typeof draftEnvelopeSchema>;

export interface DraftEnvelope {
  document: WorkflowDraftDocument;
  savedAt: string;
}

export function draftKey(workflowId: string): string {
  return `nodus-workflow-draft-v2:${workflowId}`;
}

function legacyKey(workflowId: string): string {
  return `nodus-workflow-draft-v1:${workflowId}`;
}

/** v1 → документ с раскладкой (позиции → layout.stages). */
function migrated(envelope: Envelope): WorkflowDraftDocument {
  const positions = envelope.positions ?? {};
  if (Object.keys(positions).length === 0) return envelope.document;
  const layout = envelope.document.layout ?? { stages: {}, transitions: {} };
  return {
    ...envelope.document,
    layout: { ...layout, stages: { ...layout.stages, ...positions } },
  };
}

function readEnvelope(workflowId: string): Envelope | null {
  try {
    for (const key of [draftKey(workflowId), legacyKey(workflowId)]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = draftEnvelopeSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return { ...parsed.data, document: migrated(parsed.data) };
    }
  } catch {
    /* битый JSON или недоступное хранилище — черновика нет */
  }
  return null;
}

/** Черновик той же версии: null — нет/битый/версия ушла. */
export function readDraft(workflowId: string, version: number): DraftEnvelope | null {
  const envelope = readEnvelope(workflowId);
  if (!envelope || envelope.baseVersion !== version) return null;
  return { document: envelope.document, savedAt: envelope.savedAt };
}

/** Устаревший черновик (версия ушла): когда сохранён — для баннера. */
export function readStaleDraft(workflowId: string, version: number): string | null {
  const envelope = readEnvelope(workflowId);
  return envelope && envelope.baseVersion !== version ? envelope.savedAt : null;
}

export function persistDraft(
  workflowId: string,
  document: WorkflowDraftDocument,
  baseVersion: number,
): string {
  const savedAt = new Date().toISOString();
  try {
    localStorage.setItem(draftKey(workflowId), JSON.stringify({ document, baseVersion, savedAt }));
    localStorage.removeItem(legacyKey(workflowId));
  } catch {
    // localStorage недоступен (приватный режим) — черновик живёт в сессии.
  }
  return savedAt;
}

export function clearDraft(workflowId: string): void {
  try {
    localStorage.removeItem(draftKey(workflowId));
    localStorage.removeItem(legacyKey(workflowId));
  } catch {
    /* noop */
  }
}
