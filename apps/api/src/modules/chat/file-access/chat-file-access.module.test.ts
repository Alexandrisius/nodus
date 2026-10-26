import { describe, expect, it } from 'vitest';
import { Inject, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from '../../../core/database/database.module.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import { ChatFileAccessModule } from './chat-file-access.module.js';
import { ChatFileAccess } from './chat-file-access.provider.js';

/** Потребитель-зонд: инжектит контрибьютора БЕЗ @Optional — при исчезновении
 *  exports у ChatFileAccessModule компиляция контейнера упадёт (Nest can't
 *  resolve dependencies), а не молча вернёт owner-only режим. */
class ProbeConsumer {
  constructor(@Inject(ChatFileAccess) readonly access: ChatFileAccess) {}
}

@Module({
  imports: [DatabaseModule, ChatFileAccessModule],
  providers: [ProbeConsumer],
})
class ProbeModule {}

describe('ChatFileAccessModule (#138)', () => {
  it('экспортирует контрибьютора глобально, маркер контекста — chat (#55)', async () => {
    const app = await Test.createTestingModule({ imports: [ProbeModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const probe = app.get(ProbeConsumer);
    expect(probe.access.fileAccessContext).toBe('chat');
    expect(typeof probe.access.check).toBe('function');
    await app.close();
  });
});
