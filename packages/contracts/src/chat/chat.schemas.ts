import { z } from 'zod';

import { letterRefSchema } from '../correspondence/letter.schemas.js';
import { userRefSchema } from '../directory/user-ref.schema.js';
import { projectRefSchema, taskRefSchema } from '../tasks/task.schemas.js';
import { cursorQuerySchema } from '../pagination/paginated.schema.js';

/** Контракты модуля чата (chat.Conversation/Message). */

export const conversationTypeSchema = z.enum([
  'direct',
  'group',
  'project_channel',
  'task',
  'letter',
]);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const messageAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
  /** Явный вид (НЕ выводить из mime: mime — для иконки и валидации):
   *  image — галерея, file — чип. */
  kind: z.enum(['image', 'file']),
  /** Адрес оригинала (в проде — MinIO через StorageDriver, I13). */
  url: z.string().nullable(),
  /** Превью для галереи (null у файлов). */
  thumbnailUrl: z.string().nullable(),
  /** Габариты изображения: резерв бокса до загрузки (лента без сдвига). */
  width: z.number().int().min(0).nullable(),
  height: z.number().int().min(0).nullable(),
});

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const messageReactionSchema = z.object({
  emoji: z.string().min(1),
  count: z.number().int().min(1),
  mine: z.boolean(),
});

export type MessageReaction = z.infer<typeof messageReactionSchema>;

/** Данные цитаты-ответа — ЗАМОРОЖЕННЫЙ снапшот на момент отправки (вердикт
 *  владельца 24.09: «нужно видеть то, на что отвечал сотрудник»; правка
 *  оригинала цитату не меняет — переход показывает актуальную версию). */
export const replyPreviewSchema = z.object({
  id: z.uuid(),
  /** Автор оригинала; null — оригинал удалён бесследно и автор неизвестен. */
  author: userRefSchema.nullable(),
  /** Сниппет текста оригинала (серверное усечение); '' у чисто медийного. */
  text: z.string(),
  /** Частичная цитата (модель Telegram Replies 2.0): процитированный
   *  фрагмент вместо начала текста; null — цитата всего сообщения. */
  quoteText: z.string().nullable(),
  /** Вид вложения оригинала — подписи «Фото»/«Файл» в цитате без текста. */
  attachmentKind: z.enum(['image', 'file']).nullable(),
  /** Оригинал удалён — цитата показывает «Сообщение удалено» (канон
   *  Telegram lng_deleted_message): удаление сильнее заморозки снапшота. */
  deleted: z.boolean(),
});

export type ReplyPreview = z.infer<typeof replyPreviewSchema>;

/** Источник пересланного сообщения: атрибуция «Переслано от X» + переход
 *  к оригиналу (с проверкой прав на сервере). */
export const forwardedFromSchema = z.object({
  author: userRefSchema,
  conversationId: z.uuid(),
  messageId: z.uuid(),
  /** Оригинал жил в треде канала — переход целится в окно треда. */
  threadRootId: z.uuid().nullable(),
});

export type ForwardedFrom = z.infer<typeof forwardedFromSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  author: userRefSchema,
  text: z.string(),
  replyToId: z.uuid().nullable(),
  /** Данные цитаты (снапшот); null — сообщение без ответа. */
  reply: replyPreviewSchema.nullable(),
  /** Треды ровно одного уровня: ответы ссылаются на корневое сообщение. */
  threadRootId: z.uuid().nullable(),
  threadRepliesCount: z.number().int().min(0),
  reactions: z.array(messageReactionSchema),
  attachments: z.array(messageAttachmentSchema),
  editedAt: z.iso.datetime().nullable(),
  /** Надгробие: сообщение удалено СО СЛЕДОМ (хоть один участник прочитал —
   *  правило определяет сервер по курсорам прочтения). text='', вложения и
   *  реакции очищены; UI рендерит placeholder «Сообщение удалено». */
  deletedAt: z.iso.datetime().nullable(),
  /** Закреплено в беседе (лента закрепов — GET /pins; флаг для реакции
   *  ленты/меню без загрузки списка). */
  pinned: z.boolean(),
  /** Пересланное: источник для атрибуции и перехода; null — своё. */
  forwardedFrom: forwardedFromSchema.nullable(),
  /** Метка прочтения: когда собеседник прочитал сообщение (галочки «sent/read»
   *  у своих сообщений); null — отправлено, ещё не прочитано. Правка сообщения
   *  сбрасывает метку — «повторный пуш прочитавшим» (решение #41). */
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type ChatMessage = z.infer<typeof messageSchema>;

/** Закрепленное сообщение: снапшот обязателен — закреп может жить вне
 *  загруженного окна ленты (пин-бар и секция «Закреплённые» рендерят из него). */
export const messagePinSchema = z.object({
  message: messageSchema,
  pinnedBy: userRefSchema,
  pinnedAt: z.iso.datetime(),
});

export type MessagePin = z.infer<typeof messagePinSchema>;

export const conversationListItemSchema = z.object({
  id: z.uuid(),
  type: conversationTypeSchema,
  /** Для direct — вычисляется из имён участников на клиенте/сервере. */
  title: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  project: projectRefSchema.nullable(),
  /** Чат задачи (type=task): привязка к задаче для вкладки «Чаты задач». */
  task: taskRefSchema.nullable(),
  /** Чат письма (type=letter): привязка к письму; участники — только
   *  внутренние сотрудники (обсуждение наружу не уходит). */
  letter: letterRefSchema.nullable(),
  membersPreview: z.array(userRefSchema),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().min(0),
  /** Закреплена (контекстное меню беседы, реф Битрикс24): закреплённые — сверху. */
  pinned: z.boolean(),
  /** Звук выключен (уведомления копятся без звука; глиф на строке). */
  muted: z.boolean(),
  /** «Посмотреть позже»: счётчик непрочитанных скрыт до НОВОГО сообщения. */
  snoozed: z.boolean(),
});

export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

/** Правка состояния беседы из контекстного меню (ПКМ, реф Битрикс24):
 *  закрепить/звук/«посмотреть позже»/скрыть из списка. */
export const conversationUpdateBodySchema = z
  .object({
    pinned: z.boolean().optional(),
    muted: z.boolean().optional(),
    snoozed: z.boolean().optional(),
    /** Скрыть из списка (архив беседы: история сохраняется, I15). */
    hidden: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty update' });

export type ConversationUpdateBody = z.infer<typeof conversationUpdateBodySchema>;

export const listConversationsQuerySchema = cursorQuerySchema.extend({
  search: z.string().trim().min(1).max(128).optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listMessagesQuerySchema = cursorQuerySchema.extend({
  /** Тред канала: корневое сообщение + его ответы (ровно один уровень). */
  threadRootId: z.uuid().optional(),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

/** Отправка сообщения: в тред канала — с threadRootId (корень + ответы);
 *  ответ-цитата — replyToId; вложения — ids загруженных через
 *  POST /chat/attachments. Текст ИЛИ вложения обязательны (сообщение
 *  только с файлом — валидно, канон Telegram). */
export const sendMessageBodySchema = z
  .object({
    text: z.string().trim().max(4000),
    attachmentIds: z.array(z.uuid()).max(20).optional(),
    replyToId: z.uuid().nullable().optional(),
    /** Частичная цитата: фрагмент текста оригинала, выделенный автором
     *  ответа (модель Telegram Replies 2.0); сервер усекает снапшот. */
    quoteText: z.string().trim().max(1024).nullable().optional(),
    threadRootId: z.uuid().nullable().optional(),
  })
  .refine((v) => v.text.length > 0 || (v.attachmentIds?.length ?? 0) > 0, {
    message: 'text or attachmentIds required',
  });

export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

/** Правка сообщения (без лимита давности — решение #41): только текст;
 *  вложения не заменяются (паттерн Telegram: замена медиа не поддерживается). */
export const editMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export type EditMessageBody = z.infer<typeof editMessageBodySchema>;

/** Пакетное удаление (лимит 100 — явный, как у Telegram; превышение —
 *  ошибка валидации, не молчаливое обрезание). */
export const batchDeleteMessagesBodySchema = z.object({
  messageIds: z.array(z.uuid()).min(1).max(100),
});

export type BatchDeleteMessagesBody = z.infer<typeof batchDeleteMessagesBodySchema>;

/** Результат пакетного удаления: какие исчезли бесследно (204-семантика)
 *  и какие стали надгробиями (прочитаны — след остаётся). */
export const batchDeleteMessagesResultSchema = z.object({
  removed: z.array(z.uuid()),
  tombstones: z.array(messageSchema),
});

export type BatchDeleteMessagesResult = z.infer<typeof batchDeleteMessagesResultSchema>;

/** Пересылка: серверные копии сообщений в целевую беседу (вложения
 *  переиспользуются по ссылке). Комментарий — отдельным сообщением ПЕРЕД
 *  блоком (канон Telegram ShareBox). threadRootId — цель внутри канала:
 *  тред конкретного поста; null/отсутствует — в ленту (новый корень). */
export const forwardMessagesBodySchema = z.object({
  sourceConversationId: z.uuid(),
  messageIds: z.array(z.uuid()).min(1).max(100),
  comment: z.string().trim().max(4000).optional(),
  threadRootId: z.uuid().nullable().optional(),
});

export type ForwardMessagesBody = z.infer<typeof forwardMessagesBodySchema>;
