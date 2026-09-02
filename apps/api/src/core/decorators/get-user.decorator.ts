import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@nodus/contracts';

/** Ключ, под которым auth-модуль кладёт пользователя в request. */
export const REQUEST_USER_KEY = 'user';

/**
 * Канон доступа к текущему пользователю (patterns.md): `@GetUser() user: AuthUser`.
 * Наполняется auth-модулем из сессии/JWT; без него (и без @Public) —
 * PermissionGuard вернёт UNAUTHENTICATED.
 */
export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    return (request as FastifyRequest & { [REQUEST_USER_KEY]?: AuthUser })[REQUEST_USER_KEY];
  },
);
