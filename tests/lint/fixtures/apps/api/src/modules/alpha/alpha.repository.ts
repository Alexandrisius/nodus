// Легальный потребитель PrismaService — репозиторий модуля.
import { PrismaService } from '../../core/database/prisma.service.js';

export class AlphaRepository {
  constructor(readonly prisma: PrismaService) {}
}
