import { api } from '../api-client.js';
import { useChatDrafts } from './chat-drafts.js';
import { MESSAGE_TEXT_LIMIT } from './chat-composer.js';

/**
 * Серверная синхронизация черновика — ТОЛЬКО НА УХОДЕ из беседы (вердикт
 * владельца 25.09: «онлайн-трансляция набранного текста не нужна»). Живого
 * debounce НЕТ: во время набора сервер ничего не получает, поэтому и метка
 * «Черновик», и подъём беседы в списке появляются только после ухода —
 * от серверного draft в conversationListItem.
 *
 * Точки фиксации (все — уход):
 * - переключение беседы / размонтирование композера (flushDraftSync из
 *   cleanup-эффекта композера с зависимостью [focusId]: React вызывает
 *   ПРЕДЫДУЩИЙ cleanup и при переиспользовании компонента со сменой focusId,
 *   и при размонтировании — модель Bitrix24 «черновик фиксируется уходом»);
 * - скрытие вкладки (visibilitychange hidden) и закрытие страницы
 *   (pagehide) — единственные надёжные события исчезновения вкладки;
 *   слушатели ставятся ОДИН РАЗ при инициализации модуля (замечание
 *   валидатора 25.09: ленивая установка оставляла свежую сессию без защиты).
 *
 * Пустой текст = УДАЛЕНИЕ серверного черновика (PUT text:''): отправляется,
 * если для беседы ранее уходил непустой черновик (lastSent), — иначе снятая
 * в поле метка висела бы вечно (дефект приёмки 25.09). Повторный пустой
 * уход не шлётся (дедуп lastSent === '').
 *
 * Режим ПРАВКИ сообщения черновик не пишет вовсе (вердикт 25.09).
 * Серверный контракт не менялся (PUT /chat/conversations/:id/draft).
 * Защиты: дедупликация неизменного текста (lastSent), in-flight отменяется
 * AbortController (последняя попытка выигрывает), ошибка сети не трогает
 * локальный слой — он первичен.
 *
 * Тредовые черновики (thread:…) — только локальные: серверный черновик один
 * на беседу на пользователя (модель Telegram).
 */

const inflight = new Map<string, AbortController>();
const lastSent = new Map<string, string>();

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
    // abort/сеть: локальный слой первичен, следующий уход перезапишет сервер.
  } finally {
    if (inflight.get(conversationId) === controller) inflight.delete(conversationId);
  }
}

/** Что отправлять при уходе из scope: null — отправки нет (не беседа, режим
 *  правки, текст сверх лимита (PUT упал бы 422 — раунд 3; черновик живёт
 *  локально до усечения), либо текст не менялся с последней отправки — дедуп). */
function flushPlan(scopeKey: string): { conversationId: string; text: string } | null {
  const conversationId = scopeConversationId(scopeKey);
  if (!conversationId) return null;
  const draft = useChatDrafts.getState().drafts[scopeKey];
  if (draft?.edit) return null;
  const text = draft?.text ?? '';
  if (text.length > MESSAGE_TEXT_LIMIT) return null;
  if (text === (lastSent.get(conversationId) ?? '')) return null;
  return { conversationId, text };
}

/** Уход из беседы (переключение/размонтирование композера): фиксируем
 *  черновик текущим текстом поля; пустое поле после непустого черновика шлёт
 *  PUT '' (снятие метки). Resolves true ПОСЛЕ завершения PUT — вызывающий
 *  обновляет список бесед только тогда, когда сервер уже хранит метку
 *  (одновременный refetch обгонял PUT и приходил без неё — дефект приёмки
 *  25.09 «метка появляется только при выходе из модуля»). */
export function flushDraftSync(scopeKey: string): Promise<boolean> {
  const plan = flushPlan(scopeKey);
  if (!plan) return Promise.resolve(false);
  return putDraft(plan.conversationId, plan.text).then(() => true);
}

/** Скрытие вкладки/закрытие страницы: фиксируем все беседы с локальными
 *  черновиками И все, чей черновик уже на сервере (очистка пустым текстом). */
function flushAllOnLeave(): void {
  const scopeKeys = new Set(Object.keys(useChatDrafts.getState().drafts));
  for (const conversationId of lastSent.keys()) {
    scopeKeys.add(`conversation:${conversationId}`);
  }
  for (const scopeKey of scopeKeys) void flushDraftSync(scopeKey);
}

let leaveListenersInstalled = false;

function installLeaveListeners(): void {
  if (leaveListenersInstalled) return;
  leaveListenersInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    flushAllOnLeave();
  });
  window.addEventListener('pagehide', () => {
    flushAllOnLeave();
  });
}

// Инициализация модуля (первый импорт композером чата): защита ухода
// «вкладка исчезла» действует сразу, до первого flushDraftSync.
installLeaveListeners();
