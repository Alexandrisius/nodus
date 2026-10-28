import { AtSign, CalendarCheck, Mail, ScanLine, Shapes, UserPen } from 'lucide-react';
import type { LetterDetail, UserRef } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { formatDateTimeShort } from '../../../../shared/lib/format.js';
import type { EntityFieldDef } from '../../../../shared/ui/entity-fields.js';
import { PersonAvatar } from '../../../../shared/ui/person-avatar.js';
import { formatIsoDate } from '../../lib/letter-format.js';
import { mono, notSet } from './letter-value-bits.js';

function Person({ user }: { user: UserRef | null }) {
  if (!user) return notSet;
  return (
    <>
      <PersonAvatar name={user.displayName} avatarUrl={user.avatarUrl} className="size-6" />
      <span className="truncate">{user.displayName}</span>
    </>
  );
}

/**
 * Читательские строки доски реквизитов письма (пара к `letter-fields-board`):
 * факт поступления, отправитель почты, тип письма и — у зарегистрированного —
 * дата регистрации и регистратор (до регистрации эти две строки гарантированно
 * пустые и форму не засоряют). Порядок строк доски = порядок этого реестра
 * после редактируемых полей формы.
 */
export function infoFieldDefs(letter: LetterDetail, unregistered: boolean): EntityFieldDef[] {
  return [
    ...(unregistered
      ? []
      : [
          {
            key: 'regDate',
            icon: <CalendarCheck className="size-3.5" />,
            label: ui.letters.fields.regDate,
            render: () => (letter.regDate ? mono(formatIsoDate(letter.regDate)) : notSet),
          },
          {
            key: 'registrar',
            icon: <UserPen className="size-3.5" />,
            label: ui.letters.fields.registrar,
            render: () => <Person user={letter.registrar} />,
          },
        ]),
    {
      key: 'received',
      icon:
        letter.source === 'manual' ? (
          <ScanLine className="size-3.5" />
        ) : (
          <Mail className="size-3.5" />
        ),
      label: ui.letters.fields.receivedAt,
      // Комментарий источника не показываем (приёмка 28.10: «Получено
      // почтой» не влезает) — источник и так в полосе цепочки карточки.
      render: () => mono(formatDateTimeShort(letter.receivedAt)),
    },
    ...(letter.mail
      ? [
          {
            key: 'sender',
            icon: <AtSign className="size-3.5" />,
            label: ui.letters.fields.sender,
            render: () => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">
                  {letter.mail!.fromName ?? letter.mail!.fromAddress}
                </span>
                <span className="truncate font-mono text-label-sm text-muted-foreground">
                  {letter.mail!.fromAddress}
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'type',
      icon: <Shapes className="size-3.5" />,
      label: ui.letters.fields.type,
      render: () => <span className="truncate">{letter.type.name}</span>,
    },
  ];
}
