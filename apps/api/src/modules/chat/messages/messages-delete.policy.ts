import { Permission } from '@nodus/contracts';

/** Типы бесед, где работает модерация (#245): группы и каналы. Личные,
 *  «Избранное» (direct), беседы задач и писем — модерация не действует. */
const MODERATED_TYPES = new Set(['group', 'project_channel']);

/** #245: право удалить ЧУЖОЕ сообщение — админ/владелец беседы либо
 *  глобальное право chat.moderate (модератор портала); только группы и
 *  каналы. Свои сообщения автор удаляет всегда — вне этой проверки.
 *  Надгробие/бесследность — общий канон #163, модерация второй механики
 *  не создаёт. */
export function canDeleteForeignMessage(args: {
  conversationType: string;
  memberRole: string;
  permissions: readonly string[];
}): boolean {
  if (!MODERATED_TYPES.has(args.conversationType)) return false;
  if (args.memberRole === 'admin' || args.memberRole === 'owner') return true;
  return args.permissions.includes(Permission.CHAT_MODERATE);
}
