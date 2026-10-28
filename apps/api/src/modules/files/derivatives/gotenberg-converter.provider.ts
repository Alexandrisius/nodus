import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type {
  DocumentConverter,
  HtmlPdfAsset,
} from '../../../core/ports/document-converter.port.js';
import { DERIVATIVES_CONFIG, type DerivativesConfig } from './derivatives.config.js';

/**
 * Реализация порта DOCUMENT_CONVERTER (Gotenberg/Chromium, «Основной документ
 * письма» #56): HTML с ассетами → PDF. Отдельный роут от производных #139
 * (там LibreOffice над офисными файлами) — печатный вид HTML-документа даёт
 * Chromium. A4, обычные поля: PDF-копия — документ, а не экранная страница.
 * Gotenberg не настроен — ошибка: вызывающий (воркер письма) деградирует
 * флагом «кандидат недоступен».
 */
@Injectable()
export class GotenbergConverterProvider implements DocumentConverter {
  constructor(
    @Inject(DERIVATIVES_CONFIG) private readonly config: DerivativesConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GotenbergConverterProvider.name);
  }

  /** Конвейер включён (Gotenberg настроен): воркер письма пропускает задачу
   *  молча, без флага отказа. */
  get available(): boolean {
    return this.config.gotenbergUrl !== null;
  }

  async htmlToPdf(html: string, assets: readonly HtmlPdfAsset[]): Promise<Buffer> {
    const url = this.config.gotenbergUrl;
    if (!url) throw new Error('Gotenberg не настроен (GOTENBERG_URL)');
    const form = new FormData();
    form.append('files', new Blob([html]), 'index.html');
    for (const asset of assets) {
      form.append('files', new Blob([asset.bytes], { type: asset.mime }), asset.name);
    }
    // Печатный формат копии — документ, а не экранная страница: A4 (Chromium
    // берёт размер полями paperWidth/paperHeight, единицы in/pt/cm — без
    // «paperSize» и мм, дока Gotenberg) с полями 1,5 см.
    form.append('paperWidth', '21cm');
    form.append('paperHeight', '29.7cm');
    form.append('marginTop', '1.5cm');
    form.append('marginBottom', '1.5cm');
    form.append('marginLeft', '1.5cm');
    form.append('marginRight', '1.5cm');
    const response = await fetch(`${url}/forms/chromium/convert`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Gotenberg chromium convert failed (${response.status})`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error('Gotenberg returned empty PDF');
    return bytes;
  }
}
