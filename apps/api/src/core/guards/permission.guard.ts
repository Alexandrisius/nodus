import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ErrorCode, type AuthUser, type Permission } from '@nodus/contracts';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { REQUEST_USER_KEY } from '../decorators/get-user.decorator.js';
import { DomainException } from '../errors/domain-exception.js';

/**
 * RBAC на уровне API (I8). Глобальный guard: маршруты с `@RequirePermissions`
 * требуют аутентифицированного пользователя с нужными правами; `@Public()`
 * и маршруты без метаданных прав пропускаются (права навешиваются явно).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // маршрут без явных прав — публичный на уровне RBAC
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = (request as FastifyRequest & { [REQUEST_USER_KEY]?: AuthUser })[REQUEST_USER_KEY];
    if (!user) {
      throw DomainException.unauthenticated();
    }
    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length > 0) {
      throw new DomainException(ErrorCode.FORBIDDEN, 'Insufficient permissions', {
        required,
      });
    }
    return true;
  }
}
