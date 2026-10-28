import { TriangleAlert } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

/** Флаги приёма почты (#56) под формой регистрации: неполный
 *  разбор/хранение — Вика видит, что регистрирует по неполным данным.
 *  Пропуски формы текстом НЕ перечисляются (вердикт владельца 28.10):
 *  обязательность несут звёздочки, попытка с пропусками красит рамки. */
export function RegistrationSummary({ letter }: { letter: LetterDetail }) {
  const flags: string[] = [];
  if (letter.mail?.parseIssue) flags.push(ui.letters.card.mailParseIssue);
  if (letter.mail?.storageIncomplete) flags.push(ui.letters.card.mailStorageIncomplete);
  if (letter.mail?.bodyPdfIssue) flags.push(ui.letters.card.mailBodyPdfIssue);
  if (flags.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {flags.map((flag) => (
        <p key={flag} className="flex items-center gap-1.5 text-warning">
          <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {flag}
        </p>
      ))}
    </div>
  );
}
