import type { Server } from 'socket.io';
import { CHAT_EVENTS, DIRECTORY_EVENTS, type RealtimeEnvelope } from '@nodus/contracts';

import type { MembershipStore } from './membership.ts';
import { convRoom, PRESENCE_ROOM, revokeConvRoom, userRoom } from './rooms.ts';

/** Деактивация сотрудника (directory, payload `{ userId }`) — каталог contracts. */
export const USER_DEACTIVATED_EVENT = DIRECTORY_EVENTS.USER_DEACTIVATED;

/** Установка/снятие пака «себе» (#318): меняется только набор владельца. */
const STICKER_INSTALL_EVENTS = new Set<string>([
  CHAT_EVENTS.STICKER_PACK_INSTALLED,
  CHAT_EVENTS.STICKER_PACK_UNINSTALLED,
]);

/** События, меняющие список бесед (lastMessage/unread/название/аватар) → дублируем в user-комнаты участников. */
const LIST_EVENTS = new Set([
  'chat.message_sent',
  'chat.message_edited',
  'chat.message_deleted',
  // #186: название/аватар видны в списке у всех участников.
  'chat.conversation_updated',
]);

/**
 * Маршрутизация envelope по комнатам (чистая функция для юнит-тестов):
 * - события беседы → `conv:{conversationId}` (только члены в комнате);
 * - message_sent/edited/deleted → плюс user-комнаты участников (список бесед);
 * - message_read → комната беседы (галочки автора) + user:{reader} (свои устройства);
 * - conversation_created/member_added → user-комнаты затронутых;
 * - notification.* (#100) → user-комната получателя (payload.userId или
 *   snapshot.userId); прочие типы — игнор (стрим несёт все доменные события,
 *   gateway расходует только адресованные ему);
 * - chat.sticker_* (#318) — беседы у них нет: установка/снятие → user-комната
 *   установившего; содержимое пака → корпоративный всем (комната presence =
 *   все аутентифицированные сокеты), личный — user-комнаты payload.audience;
 * - directory.user.deactivated → принудительное отключение всех сокетов
 *   пользователя (сокет аутентифицирован один раз на хендшейке и иначе
 *   пережил бы деактивацию; клиент на `io server disconnect` сам не
 *   переподключается, refresh-сессии уже отозвал auth).
 */
export async function routeEnvelope(
  io: Server,
  store: MembershipStore,
  envelope: RealtimeEnvelope,
): Promise<void> {
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;

  if (envelope.type === USER_DEACTIVATED_EVENT) {
    if (typeof payload.userId === 'string') {
      // close=true: DISCONNECT-пакет уходит до закрытия транспорта (engine.io
      // дожидается drain), клиент получает `io server disconnect` без автореконнекта.
      io.in(userRoom(payload.userId)).disconnectSockets(true);
    }
    return;
  }

  if (envelope.type.startsWith('notification.')) {
    const snapshot = payload.snapshot as Record<string, unknown> | undefined;
    const target =
      (typeof payload.userId === 'string' && payload.userId) ||
      (typeof snapshot?.userId === 'string' ? snapshot.userId : null);
    if (target) {
      io.to(userRoom(target)).emit(envelope.type, envelope);
    }
    return;
  }

  // Задачи (#37): адресаты — payload.audience (участники задачи, при снятии —
  // и снятый), user-комнаты; клиент инвалидирует кэш задач.
  if (envelope.type.startsWith('task.')) {
    emitToUsers(io, envelope, memberIdsOf(payload.audience));
    return;
  }

  if (envelope.type.startsWith('chat.sticker_')) {
    routeStickerEvent(io, envelope, payload);
    return;
  }

  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId : null;

  if (envelope.type === 'chat.conversation_created') {
    emitToUsers(io, envelope, memberIdsOf(payload.memberIds));
    return;
  }
  if (envelope.type === 'chat.member_added') {
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    emitToUsers(io, envelope, memberIdsOf(payload.userIds));
    return;
  }
  if (envelope.type === 'chat.member_removed') {
    // #186: исключённый (payload.userId) теряет беседу из списка — его
    // user-комната; остальные участники рефечат счётчик и панель в conv-комнате.
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
      // Событие доставлено — выводим его сокеты из комнаты беседы (#252).
      if (conversationId) await revokeConvRoom(io, payload.userId, conversationId);
    }
    return;
  }
  if (envelope.type === 'chat.member_role_changed') {
    // #186: смена роли видна участникам беседы (панель участников).
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (envelope.type === 'chat.message_read') {
    if (conversationId) {
      io.to(convRoom(conversationId)).emit(envelope.type, envelope);
    }
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  // Избранное (#171): личное состояние (как прочитанность) — только
  // user-комната владельца, участникам беседы не рассылается.
  if (
    envelope.type === 'chat.favorite_added' ||
    envelope.type === 'chat.favorite_removed' ||
    envelope.type === 'chat.favorite_updated'
  ) {
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (!conversationId) {
    return; // message_*/reaction/pin/thread_created без беседы — некуда маршрутизировать
  }
  io.to(convRoom(conversationId)).emit(envelope.type, envelope);
  if (LIST_EVENTS.has(envelope.type)) {
    emitToUsers(io, envelope, await store.memberIds(conversationId));
  }
}

function routeStickerEvent(
  io: Server,
  envelope: RealtimeEnvelope,
  payload: Record<string, unknown>,
): void {
  if (STICKER_INSTALL_EVENTS.has(envelope.type)) {
    if (typeof payload.userId === 'string') {
      io.to(userRoom(payload.userId)).emit(envelope.type, envelope);
    }
    return;
  }
  if (payload.scope === 'corporate') {
    io.to(PRESENCE_ROOM).emit(envelope.type, envelope);
    return;
  }
  // Личный пак: только видящие его; без scope/audience (старый формат) — никому.
  emitToUsers(io, envelope, memberIdsOf(payload.audience));
}

function emitToUsers(io: Server, envelope: RealtimeEnvelope, userIds: string[]): void {
  for (const userId of userIds) {
    io.to(userRoom(userId)).emit(envelope.type, envelope);
  }
}

function memberIdsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
