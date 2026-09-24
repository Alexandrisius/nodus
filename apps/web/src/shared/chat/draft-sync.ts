import { api } from '../api-client.js';

/**
 * Синхронизация черновика с сервером (контракт #91, тайминги tdesktop):
 * локальный слой (chat-drafts + localStorage) пишет МГНОВЕННО и переживает
 * перезагрузку; сетевой PUT /chat/conversations/:id/draft — с debounce
 * 1000 мс после паузы набора (SaveDraftTimeout tdesktop), плюс flush при
 * переключении беседы (размонтирование композера — модель Bitrix24:
 * черновик фиксируется уходом из диалога) и при visibilitychange:hidden
 * (единственное надёжное событие закрытия вкладки).
 *
 * Защиты от спама сервером каждым символом (исследование #91):
 * - дедупликация: неизменившийся текст не шлётся;
 * - in-flight отменяется AbortController — последняя попытка выигрывает;
 * - ошибка сети НЕ трогает локальный слой: он первичен, сервер догоняет.
 *
 * Тредовые черновики (thread:…) — только локальные: серверный черновик один
 * на беседу на пользователя (модель Telegram), темы придут со своим треком.
 */

const DEBOUNCE_MS = 1000;

interface Pending {
  conversationId: string;
  text: string;
  timer: number;
}

const pending = new Map<string, Pending>();
const inflight = new Map<string, AbortController>();
const lastSent = new Map<string, string>();
let visibilityInstalled = false;

function scopeConversationId(scopeKey: string): string | null {
  if (scopeKey.startsWith('conversation:')) return scopeKey.slice('conversation:'.length);
  if (scopeKey.startsWith('feed:')) return scopeKey.slice('feed:'.length);
  return null;
}

async function putDraft(conversationId: string, text: string): Promise<void> {
  inflight.get(conversationId)?.abort();
  const controller = new AbortController();
  inflight.set(conversationId, controller);
  try {
    await api<unknown>(`/chat/conversations/${conversationId}/draft`, {
      method: 'PUT',
      body: { text },
      signal: controller.signal,
    });
    lastSent.set(conversationId, text);
  } catch {
    // abort/сеть: локальный слой первичен, следующий debounce или flush
    // перезапишет сервер актуальным текстом.
  } finally {
    if (inflight.get(conversationId) === controller) inflight.delete(conversationId);
  }
}

function installVisibilityFlush(): void {
  if (visibilityInstalled) return;
  visibilityInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    for (const [key, entry] of [...pending]) {
      window.clearTimeout(entry.timer);
      pending.delete(key);
      void putDraft(entry.conversationId, entry.text);
    }
  });
}

/** Набор в композере: планируем PUT после паузы (дедуп по отправленному). */
export function scheduleDraftSync(scopeKey: string, text: string): void {
  const conversationId = scopeConversationId(scopeKey);
  if (!conversationId) return;
  installVisibilityFlush();
  const prev = pending.get(scopeKey);
  if (prev) window.clearTimeout(prev.timer);
  if (text === (lastSent.get(conversationId) ?? '')) {
    pending.delete(scopeKey);
    return;
  }
  const timer = window.setTimeout(() => {
    pending.delete(scopeKey);
    void putDraft(conversationId, text);
  }, DEBOUNCE_MS);
  pending.set(scopeKey, { conversationId, text, timer });
}

/** Переключение беседы/размонтирование композера: черновик фиксируется сразу. */
export function flushDraftSync(scopeKey: string): void {
  const entry = pending.get(scopeKey);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(scopeKey);
  void putDraft(entry.conversationId, entry.text);
}

/** Отправка сообщения: сервер гасит черновик сам (транзакция отправки) —
 *  клиент лишь снимает несостоявшийся PUT, чтобы не «воскресить» черновик
 *  (урок tdesktop#26236). */
export function dropDraftSync(scopeKey: string): void {
  const entry = pending.get(scopeKey);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  pending.delete(scopeKey);
  lastSent.set(entry.conversationId, '');
}
