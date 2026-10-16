// Фикстура-нарушитель: PrismaService в сервисе (repository pattern).
import { PrismaService } from '../../core/database/prisma.service.js';

export class AlphaDataService {
  constructor(readonly prisma: PrismaService) {}
}
