import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { LetterBodyPdfService, BODY_PDF_NAME } from './letter-body-pdf.service.js';
import type { HtmlPdfAsset } from '../../../../core/ports/document-converter.port.js';

const UUID = '00000000-0000-4000-8000-0000000000f1';

interface Fakes {
  repo: {
    findDetailById: ReturnType<typeof vi.fn>;
    attachments: ReturnType<typeof vi.fn>;
    lock: ReturnType<typeof vi.fn>;
    hasBodyPdf: ReturnType<typeof vi.fn>;
    addBodyPdf: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  storage: {
    save: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  converter: { available: boolean; htmlToPdf: ReturnType<typeof vi.fn> };
  events: { letterId: string; changes: unknown[] }[];
  saved: { name: string; derivedFrom?: string }[];
  serviceRef: LetterBodyPdfService;
}

const contentOf = (text: string) => ({
  stream: Readable.from([text]),
  mime: 'text/html',
  name: 'x',
  size: text.length,
});

function makeFakes(
  overrides: {
    bodyMime?: string;
    html?: string;
    withMain?: boolean;
    withBodyPdf?: boolean;
    inline?: { fileId: string; contentId: string }[];
  } = {},
): Fakes {
  const events: { letterId: string; changes: unknown[] }[] = [];
  const saved: { name: string; derivedFrom?: string }[] = [];
  const rows = [
    {
      id: 'body-1',
      fileId: 'file-body',
      role: 'body',
      sortOrder: 0,
      contentId: null,
      inline: false,
    },
    ...(overrides.inline ?? []).map((asset, i) => ({
      id: `inline-${i}`,
      fileId: asset.fileId,
      role: 'attachment',
      sortOrder: i + 1,
      contentId: asset.contentId,
      inline: true,
    })),
    ...(overrides.withMain
      ? [
          {
            id: 'main-1',
            fileId: 'file-main',
            role: 'main',
            sortOrder: 9,
            contentId: null,
            inline: false,
          },
        ]
      : []),
    ...(overrides.withBodyPdf
      ? [
          {
            id: 'pdf-1',
            fileId: 'file-pdf',
            role: 'body_pdf',
            sortOrder: 8,
            contentId: null,
            inline: false,
          },
        ]
      : []),
  ];
  const fakes = {
    repo: {
      findDetailById: vi.fn(async () => ({
        id: UUID,
        deletedAt: null,
        mailParseIssue: false,
        mailBodyPdfIssue: false,
      })),
      attachments: vi.fn(async () => rows),
      lock: vi.fn(async () => undefined),
      hasBodyPdf: vi.fn(async () => false),
      addBodyPdf: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
    storage: {
      save: vi.fn(async (input: { name: string; derivedFrom?: string }) => {
        saved.push({ name: input.name, derivedFrom: input.derivedFrom });
        return { fileId: 'file-new-pdf' };
      }),
      get: vi.fn(async (fileId: string) => {
        if (fileId === 'file-body')
          return contentOf(overrides.html ?? '<html><head></head><body>Привет</body></html>');
        if (fileId.startsWith('file-img')) return contentOf('pngbytes');
        return null;
      }),
      remove: vi.fn(async () => undefined),
    },
    converter: {
      available: true,
      htmlToPdf: vi.fn(async () => Buffer.from('%PDF-mock')),
    },
    events,
    saved,
  };
  const service = new LetterBodyPdfService(
    fakes.repo as never,
    { run: async (fn: (tx: unknown) => Promise<void>) => fn({}) } as never,
    {
      emit: vi.fn(
        async (_tx: unknown, _name: string, payload: { letterId: string; changes: unknown[] }) => {
          events.push({ letterId: payload.letterId, changes: payload.changes });
        },
      ),
    } as never,
    fakes.storage as never,
    {
      refs: vi.fn(async (ids: string[]) =>
        ids.map((id) => ({
          id,
          name:
            id === 'file-body'
              ? overrides.bodyMime?.includes('html')
                ? 'Текст письма.html'
                : 'Текст письма.txt'
              : 'img.png',
          mime: id === 'file-body' ? (overrides.bodyMime ?? 'text/html') : 'image/png',
          size: 100,
        })),
      ),
    } as never,
    fakes.converter as never,
    { info: () => undefined, warn: () => undefined, setContext: () => undefined } as never,
  );
  return { ...fakes, serviceRef: service };
}

describe('PDF-копия тела письма («Основной документ письма» #56)', () => {
  it('HTML-тело: печатный вид, cid-картинки ассетами, файл-вложение role body_pdf, событие выбора', async () => {
    const fakes = makeFakes({
      html: '<html><head><title>t</title></head><body>Привет <img src="cid:logo@x"></body></html>',
      inline: [{ fileId: 'file-img1', contentId: 'logo@x' }],
    });
    const result = await fakes.serviceRef.convert(UUID);
    expect(result).toBe('created');
    const [html, assets] = (fakes.converter.htmlToPdf as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, HtmlPdfAsset[]];
    expect(html).toContain('img-0.png');
    expect(html).not.toContain('cid:logo@x');
    expect(html).toMatch(/<style>body\{background:#fff/);
    expect(assets).toHaveLength(1);
    expect(assets[0]!.mime).toBe('image/png');
    // Сохранение — производная тела, имя кандидата фиксировано.
    expect(fakes.saved[0]).toEqual({ name: BODY_PDF_NAME, derivedFrom: 'file-body' });
    // Роль body_pdf, событие «главный де-факто» (main не выбран).
    expect(fakes.repo.addBodyPdf).toHaveBeenCalledWith(expect.anything(), UUID, {
      fileId: 'file-new-pdf',
      sortOrder: expect.any(Number),
    });
    expect(fakes.events).toHaveLength(1);
    expect(fakes.events[0]!.changes).toEqual([
      { field: 'mainDocument', from: null, to: BODY_PDF_NAME },
    ]);
  });

  it('копия уже есть — идемпотентный пропуск без конвертации', async () => {
    const fakes = makeFakes({ withBodyPdf: true });
    const result = await fakes.serviceRef.convert(UUID);
    expect(result).toBe('skipped');
    expect(fakes.converter.htmlToPdf).not.toHaveBeenCalled();
  });

  it('текст-тело — читательская обёртка без ассетов', async () => {
    const fakes = makeFakes({ bodyMime: 'text/plain', html: 'План <на 3> дня' });
    await fakes.serviceRef.convert(UUID);
    const [html, assets] = (fakes.converter.htmlToPdf as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, HtmlPdfAsset[]];
    expect(html).toContain('<pre>План &lt;на 3&gt; дня</pre>');
    expect(assets).toHaveLength(0);
  });

  it('main уже выбран — событие «главный де-факто» не эмитится', async () => {
    const fakes = makeFakes({ withMain: true });
    await fakes.serviceRef.convert(UUID);
    expect(fakes.events).toHaveLength(0);
  });

  it('гонка постановок: роль занята — файл компенсируется, тихий skipped', async () => {
    const fakes = makeFakes();
    fakes.repo.hasBodyPdf.mockResolvedValueOnce(true);
    const result = await fakes.serviceRef.convert(UUID);
    expect(result).toBe('skipped');
    expect(fakes.storage.remove).toHaveBeenCalledWith(['file-new-pdf']);
  });

  it('отказ конвертера — флаг письма (деградация без падения)', async () => {
    const fakes = makeFakes();
    fakes.converter.htmlToPdf.mockRejectedValueOnce(new Error('Gotenberg down'));
    const service = fakes.serviceRef;
    await expect(service.convert(UUID)).rejects.toThrow('Gotenberg down');
    await service.markIssue(UUID, new Error('x'));
    expect(fakes.repo.update).toHaveBeenCalledWith(expect.anything(), UUID, {
      mailBodyPdfIssue: true,
    });
  });
});
