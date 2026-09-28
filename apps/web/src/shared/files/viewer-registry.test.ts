import { describe, expect, it } from 'vitest';

import { resolveViewerRoute } from './viewer-registry.js';

const ON = { officeEnabled: true, maxViewBytes: 52_428_800 };
const OFF = { officeEnabled: false, maxViewBytes: 52_428_800 };

describe('resolveViewerRoute — реестр просмотрщика (#138)', () => {
  it('офисные форматы → ONLYOFFICE (по расширению имени, не mime)', () => {
    expect(resolveViewerRoute('Смета.xlsx', 'application/octet-stream', 1000, ON).kind).toBe(
      'office',
    );
    expect(resolveViewerRoute('письмо.DOCX', 'application/octet-stream', 1000, ON).kind).toBe(
      'office',
    );
    expect(resolveViewerRoute('презентация.pptx', '', 1000, ON).kind).toBe('office');
    expect(resolveViewerRoute('расчёт.ods', '', 1000, ON).office).toMatchObject({
      documentType: 'cell',
    });
  });

  it('PDF → pdf.js независимо от движка офиса', () => {
    expect(resolveViewerRoute('СК.pdf', 'application/pdf', 1000, OFF).kind).toBe('pdf');
    expect(resolveViewerRoute('СК.PDF', '', 1000, ON).kind).toBe('pdf');
  });

  it('медиа — по mime (видео/аудио/картинка)', () => {
    expect(resolveViewerRoute('клип.mp4', 'video/mp4', 1000, ON).kind).toBe('media');
    expect(resolveViewerRoute('голос.mp3', 'audio/mpeg', 1000, ON).kind).toBe('media');
    expect(resolveViewerRoute('фото.png', 'image/png', 1000, ON).kind).toBe('media');
  });

  it('движок выключен → карточка скачивания с причиной office_disabled', () => {
    const route = resolveViewerRoute('Смета.xlsx', '', 1000, OFF);
    expect(route.kind).toBe('download');
    expect(route.reason).toBe('office_disabled');
  });

  it('больше потолка редактора → скачивание с причиной too_large', () => {
    const route = resolveViewerRoute('гигант.xlsx', '', 60 * 1024 * 1024, ON);
    expect(route.kind).toBe('download');
    expect(route.reason).toBe('too_large');
  });

  it('архивы и неизвестные форматы → скачивание (unsupported)', () => {
    expect(resolveViewerRoute('проект.zip', 'application/zip', 1000, ON)).toMatchObject({
      kind: 'download',
      reason: 'unsupported',
    });
    expect(resolveViewerRoute('чертёж.dwg', '', 1000, ON)).toMatchObject({
      kind: 'download',
      reason: 'unsupported',
    });
    expect(resolveViewerRoute('без-расширения', 'text/plain', 1000, ON)).toMatchObject({
      kind: 'download',
      reason: 'unsupported',
    });
  });

  it('имя важнее mime: pdf-mime у офисного имени всё равно офис', () => {
    const route = resolveViewerRoute('отчёт.docx', 'application/pdf', 1000, ON);
    expect(route.kind).toBe('office');
  });
});
