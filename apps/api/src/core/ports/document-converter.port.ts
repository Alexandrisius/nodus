import type { InjectionToken } from '@nestjs/common';

/** Картинка-ассет HTML-документа (cid-вложение письма, «Основной документ
 *  письма» #56): подставляется в конвертируемый HTML по имени. */
export interface HtmlPdfAsset {
  /** Имя файла ассета, на которое ссылается HTML (src="img-0.png"). */
  name: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Порт конвертации HTML-документа в PDF (I3/I13, «Основной документ письма»
 * #56): потребитель — correspondence (PDF-копия тела письма), реализация —
 * модуль files (Gotenberg/Chromium, рядом с конвейером производных #139).
 * Порт появился со вторым потребителем конвертера: первый (производные
 * офисных файлов) ходил в Gotenberg напрямую и знал только свой роут.
 */
export interface DocumentConverter {
  /** Конвейер включён (Gotenberg настроен): выключенный — задачи пропускаются
   *  молча, без флага отказа. */
  readonly available: boolean;

  /** HTML (+ ассеты-картинки) → PDF-байты. Бросает — конвертация недоступна
   *  или отказала; вызывающий решает, как деградировать. */
  htmlToPdf(html: string, assets: readonly HtmlPdfAsset[]): Promise<Buffer>;
}

export const DOCUMENT_CONVERTER: InjectionToken = 'DOCUMENT_CONVERTER';
