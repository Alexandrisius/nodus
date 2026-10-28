import type { LetterDetail } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatDateTimeShort } from '../../../shared/lib/format.js';
import { PersonAvatar } from '../../../shared/ui/person-avatar.js';

/**
 * Отправитель почтового письма (#56, вердикт владельца 28.10) — строка «как
 * в почтовых клиентах»: аватар по инициалам, имя и полный адрес рядом с
 * темой. В списке «Новые» адрес обрезается шириной строки; здесь он читается
 * целиком без расширения панели. У письма, созданного вручную, строки нет
 * («внесено вручную» уже сказано в списке).
 */
export function LetterSenderLine({
  letter,
  showTime = false,
  className,
}: {
  letter: LetterDetail;
  /** Время поступления справа (в конвейере оно уже в шапке — не дублируем). */
  showTime?: boolean;
  className?: string;
}) {
  const mail = letter.mail;
  if (letter.source !== 'mail' || !mail?.fromAddress) return null;
  const name = mail.fromName?.trim() || mail.fromAddress;
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <PersonAvatar name={name} className="size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-medium text-foreground" title={name}>
          {name}
        </p>
        {mail.fromName ? (
          <p
            className="truncate font-mono text-xs leading-tight text-muted-foreground"
            title={mail.fromAddress}
          >
            {mail.fromAddress}
          </p>
        ) : null}
      </div>
      {showTime ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {formatDateTimeShort(letter.receivedAt)}
        </span>
      ) : null}
    </div>
  );
}
