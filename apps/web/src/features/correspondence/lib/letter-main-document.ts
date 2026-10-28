import type { LetterAttachment, LetterDetail } from '@nodus/contracts';

/**
 * «Основной документ письма» (#56): выбор звездой файла-кандидата — этот
 * документ открывает вкладка «Письмо» и получает номер при регистрации.
 * Кандидаты — файлы (вложения + PDF-копия тела `body_pdf`); текст почты
 * (`body`) — не документ. Главный де-факто: выбранный `main`, иначе
 * PDF-копия тела (системное умолчание приёма); после регистрации выбор
 * заморожен (сервер: LETTER_NOT_EDITABLE).
 */

/** Кандидаты основного документа в порядке «Файлов». */
export function mainDocumentCandidates(letter: LetterDetail): LetterAttachment[] {
  return letter.attachments.filter(
    (file) => !file.inline && file.role !== 'source' && file.role !== 'body',
  );
}

/** Главный де-факто (вкладка «Письмо»); null — не выбран. */
export function mainDocumentOf(letter: LetterDetail): LetterAttachment | null {
  const id = letter.body.kind === 'document' ? letter.body.attachmentId : null;
  return letter.attachments.find((file) => file.id === id) ?? null;
}

/** Пропуск регистрации: кандидаты есть, звезда не выбрана (422 сервера). */
export function mainDocumentMissing(letter: LetterDetail): boolean {
  return mainDocumentCandidates(letter).length > 0 && mainDocumentOf(letter) === null;
}

/** Оптимистичное состояние после выбора звезды (зеркало серверного
 *  `setMainDocument`): выбранный файл → `main`, прежний `main` → приложение;
 *  PDF-копия тела роль не меняет — становится главным де-факто. */
export function letterWithMainDocument(letter: LetterDetail, attachmentId: string): LetterDetail {
  const attachments = letter.attachments.map((file) => {
    if (file.id === attachmentId) {
      return file.role === 'body_pdf' ? file : { ...file, role: 'main' as const };
    }
    return file.role === 'main' ? { ...file, role: 'attachment' as const } : file;
  });
  return { ...letter, attachments, body: { kind: 'document', attachmentId } };
}
