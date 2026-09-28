import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@nodus/contracts';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import type { FileAccessContributor } from '../../../core/ports/file-access.port.js';
import type { FileObjectRow } from '../files.repository.js';
import { FilesRepository } from '../files.repository.js';
import type { OfficeConfig } from './office.config.js';
import { OfficeSessionService } from './office-session.service.js';
import { OfficeTokenService } from './office-token.service.js';
import { DomainException } from '../../../core/errors/domain-exception.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_ID = '00000000-0000-0000-0000-000000000002';
const FILE_ID = '00000000-0000-0000-0000-00000000000f';

const SECRET = 'test-secret-32-chars-aaaaaaaaaaaa';

function makeUser(id: string): AuthUser {
  return { id, email: 'u@nodus.by', displayName: 'Тест Тестов', permissions: [] };
}

function makeFile(overrides: Partial<FileObjectRow> = {}): FileObjectRow {
  return {
    id: FILE_ID,
    ownerId: USER_ID,
    bucket: 'nodus-files',
    key: `files/${FILE_ID}`,
    version: 1,
    name: 'Смета.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
    scanStatus: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<OfficeConfig> = {}): OfficeConfig {
  return {
    enabled: true,
    editEnabled: true,
    jwtSecret: SECRET,
    apiInternalUrl: 'http://api-internal:3001',
    internalUrl: 'http://ds-internal:80',
    maxViewBytes: 52_428_800,
    ...overrides,
  };
}

function makeService(
  file: FileObjectRow | null,
  configOverrides: Partial<OfficeConfig> = {},
  contributors: FileAccessContributor[] = [],
): { service: OfficeSessionService; repo: FilesRepository } {
  const repo = { findById: vi.fn(async () => file) } as unknown as FilesRepository;
  const config = makeConfig(configOverrides);
  const service = new OfficeSessionService(
    repo,
    config,
    new OfficeTokenService(config),
    new SignedUrlService({ STORAGE_URL_SECRET: SECRET }),
    contributors,
  );
  return { service, repo };
}

describe('OfficeSessionService (#138)', () => {
  it('владелец получает view-сессию: внутренние URL, JWT, документ-ключ с версией', async () => {
    const { service } = makeService(makeFile());
    const session = await service.createSession(FILE_ID, makeUser(USER_ID), 'view');
    expect(session.mode).toBe('view');
    expect(session.canEdit).toBe(true);
    expect(session.documentType).toBe('cell');
    expect(session.document.key).toBe(`${FILE_ID}.v1`);
    expect(session.document.url).toMatch(
      new RegExp(`^http://api-internal:3001/api/v1/files/${FILE_ID}/content\\?exp=`),
    );
    expect(session.editorConfig.callbackUrl).toBe(
      `http://api-internal:3001/api/v1/files/${FILE_ID}/office-callback`,
    );
    expect(session.editorConfig.lang).toBe('ru');
    expect(typeof session.token).toBe('string');
  });

  it('право контекста: контрибьютор chat открывает файл участнику беседы', async () => {
    const contributor: FileAccessContributor = {
      check: vi.fn(async () => ({ canView: true, canEdit: true })),
    };
    const { service } = makeService(makeFile(), {}, [contributor]);
    const session = await service.createSession(FILE_ID, makeUser(OTHER_ID), 'view');
    expect(session.mode).toBe('view');
    expect(contributor.check).toHaveBeenCalledWith(FILE_ID, OTHER_ID);
  });

  it('чужой файл без контекста — NOT_FOUND (не раскрываем существование)', async () => {
    const { service } = makeService(makeFile());
    await expect(service.createSession(FILE_ID, makeUser(OTHER_ID), 'view')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('контрибьютор с явным отказом не открывает доступ', async () => {
    const contributor: FileAccessContributor = {
      check: vi.fn(async () => ({ canView: false, canEdit: false })),
    };
    const { service } = makeService(makeFile(), {}, [contributor]);
    await expect(service.createSession(FILE_ID, makeUser(OTHER_ID), 'view')).rejects.toBeInstanceOf(
      DomainException,
    );
  });

  it('edit без права контекста деградирует в view (не 403)', async () => {
    const contributor: FileAccessContributor = {
      check: vi.fn(async () => ({ canView: true, canEdit: false })),
    };
    const { service } = makeService(makeFile(), {}, [contributor]);
    const session = await service.createSession(FILE_ID, makeUser(OTHER_ID), 'edit');
    expect(session.mode).toBe('view');
    expect(session.canEdit).toBe(false);
    expect(session.document.permissions.edit).toBe(false);
  });

  it('edit при выключенном флаге правки деградирует в view', async () => {
    const { service } = makeService(makeFile(), { editEnabled: false });
    const session = await service.createSession(FILE_ID, makeUser(USER_ID), 'edit');
    expect(session.mode).toBe('view');
    expect(session.canEdit).toBe(false);
    expect(session.editorConfig.customization.forcesave).toBe(false);
  });

  it('view-only формат (epub) не даёт canEdit даже владельцу', async () => {
    const { service } = makeService(makeFile({ name: 'Книга.epub' }));
    const session = await service.createSession(FILE_ID, makeUser(USER_ID), 'edit');
    expect(session.mode).toBe('view');
    expect(session.canEdit).toBe(false);
    expect(session.documentType).toBe('word');
  });

  it('движок выключен — FILE_OFFICE_DISABLED 503', async () => {
    const { service } = makeService(makeFile(), { enabled: false });
    await expect(service.createSession(FILE_ID, makeUser(USER_ID), 'view')).rejects.toMatchObject({
      code: 'FILE_OFFICE_DISABLED',
    });
  });

  it('неофисный формат — FILE_OFFICE_UNSUPPORTED', async () => {
    const { service } = makeService(makeFile({ name: 'архив.zip' }));
    await expect(service.createSession(FILE_ID, makeUser(USER_ID), 'view')).rejects.toMatchObject({
      code: 'FILE_OFFICE_UNSUPPORTED',
    });
  });

  it('больше потолка — FILE_OFFICE_TOO_LARGE', async () => {
    const { service } = makeService(makeFile({ size: 60 * 1024 * 1024 }));
    await expect(service.createSession(FILE_ID, makeUser(USER_ID), 'view')).rejects.toMatchObject({
      code: 'FILE_OFFICE_TOO_LARGE',
    });
  });

  it('карантин — FILE_QUARANTINED 410', async () => {
    const { service } = makeService(makeFile({ scanStatus: 'infected' }));
    await expect(service.createSession(FILE_ID, makeUser(USER_ID), 'view')).rejects.toMatchObject({
      code: 'FILE_QUARANTINED',
    });
  });

  it('версия файла входит в ключ документа (кэш DS не смешивает версии)', async () => {
    const { service } = makeService(makeFile({ version: 3 }));
    const session = await service.createSession(FILE_ID, makeUser(USER_ID), 'view');
    expect(session.document.key).toBe(`${FILE_ID}.v3`);
  });
});
