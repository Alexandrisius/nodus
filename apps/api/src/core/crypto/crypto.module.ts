import { Global, Module } from '@nestjs/common';

import { PasswordService } from './password.service.js';

/**
 * Криптографические примитивы ядра: PasswordService (Argon2id) глобален —
 * используется auth (проверка паролей) и directory (начальный пароль
 * сотрудника) без межмодульных импортов (I3).
 */
@Global()
@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class CryptoModule {}
