/**
 * Хелперы бесед переехали в shared/chat/conversations.ts (#87: диалог
 * пересылки в shared-слое использует их; I6 — shared не импортирует features).
 * Файл оставлен реэкспортом: существующие потребители и тест не меняются.
 */
export {
  conversationSubtitle,
  conversationTitle,
  isNotesConversation,
  sortByActivity,
} from '../../../shared/chat/conversations.js';
