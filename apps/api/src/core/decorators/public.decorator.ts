import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'nodus:public';

/**
 * Маршрут без аутентификации (health, будущие webhook-и).
 * PermissionGuard пропускает такие маршруты без проверки пользователя.
 */
export const Public = (): CustomDecorator<typeof IS_PUBLIC_KEY> => SetMetadata(IS_PUBLIC_KEY, true);
