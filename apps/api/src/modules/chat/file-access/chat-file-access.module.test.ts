import { describe, expect, it } from 'vitest';
import { Inject, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from '../../../core/database/database.module.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import {
  FILE_ACCESS_CONTRIBUTORS,
  type FileAccessContributor,
} from '../../../core/ports/file-access.port.js';
import { ChatFileAccessModule } from './chat-file-access.module.js';

/** Потребитель-зонд: инжектит токен БЕЗ @Optional — при исчезновении
 *  exports у ChatFileAccessModule компиляция контейнера упадёт (Nest can't
 *  resolve dependencies), а не молча вернёт owner-only режим. */
class ProbeConsumer {
  constructor(
    @Inject(FILE_ACCESS_CONTRIBUTORS)
    readonly contributors: FileAccessContributor[],
  ) {}
}

@Module({
  imports: [DatabaseModule, ChatFileAccessModule],
  providers: [ProbeConsumer],
})
class ProbeModule {}

describe('ChatFileAccessModule (#138)', () => {
  it('экспортирует FILE_ACCESS_CONTRIBUTORS глобально: потребитель чужого модуля видит chat-контрибьютора', async () => {
    const app = await Test.createTestingModule({ imports: [ProbeModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const probe = app.get(ProbeConsumer);
    expect(probe.contributors.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });
});
