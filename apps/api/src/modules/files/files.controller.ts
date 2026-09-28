import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { SignedUrlService } from '../../core/crypto/signed-url.service.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { ErrorCode } from '@nodus/contracts';
import { Public } from '../../core/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { FilesRepository } from './files.repository.js';
import { MinioStorageDriver } from './storage/minio-storage.driver.js';

const contentQuerySchema = z.object({
  exp: z.coerce.number().int().positive(),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * Отдача файлов (`/api/v1/files`): контент по HMAC-подписи (ADR-0013).
 * `@Public`: ссылку открывают <img>/«скачать»/новая вкладка — Authorization-
 * заголовка нет; подпись = виза, выданная при формировании DTO вложения
 * (лента сообщений уже проверила членство в беседе). Заражённые (scan_status
 * = infected) не отдаются с первого дня — 410 FILE_QUARANTINED.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly repository: FilesRepository,
    private readonly driver: MinioStorageDriver,
    private readonly signedUrls: SignedUrlService,
  ) {}

  @Public()
  @Get(':id/content')
  @ApiOperation({ summary: 'Контент файла по подписанной ссылке (inline для изображений)' })
  async content(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Query({
      schema: contentQuerySchema,
      pipes: [new ZodValidationPipe(contentQuerySchema)],
    })
    query: z.infer<typeof contentQuerySchema>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!this.signedUrls.verify(id, query.exp, query.sig)) {
      throw DomainException.unauthenticated('File link is invalid or expired');
    }
    const file = await this.repository.findById(id);
    if (!file) {
      throw DomainException.notFound('File not found');
    }
    if (file.scanStatus === 'infected') {
      throw new DomainException(ErrorCode.FILE_QUARANTINED, 'File is quarantined', undefined, 410);
    }

    // Версии неизменяемы (ключ = f(id, version)) — ETag даёт честный 304.
    const etag = `"${file.id}-v1"`;
    if (request.headers['if-none-match'] === etag) {
      void reply.status(304).send();
      return;
    }

    const stream = await this.driver.get(file.key);
    const disposition = file.mime.startsWith('image/') ? 'inline' : 'attachment';
    void reply
      .header('Content-Type', file.mime)
      .header('Content-Length', file.size)
      .header(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      )
      .header('Cache-Control', 'private, max-age=3600')
      .header('ETag', etag)
      .send(stream);
  }
}
