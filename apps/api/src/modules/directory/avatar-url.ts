import type { SignedUrlService } from '../../core/crypto/signed-url.service.js';

/**
 * Аватар сотрудника — файл-дериват (#186): подписная ссылка отдачи, `null` —
 * инициалы. Одна точка для всех DTO со ссылкой на сотрудника (справочник,
 * роли: аватары шапки столбца — #379).
 */
export function avatarUrlOf(
  signedUrls: Pick<SignedUrlService, 'fileContentUrl'>,
  fileId: string | null,
): string | null {
  return fileId ? signedUrls.fileContentUrl(fileId) : null;
}
