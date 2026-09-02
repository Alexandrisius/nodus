import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@nodus/contracts';

import { REQUEST_USER_KEY } from '../../core/decorators/get-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../core/decorators/public.decorator.js';
import { DomainException } from '../../core/errors/domain-exception.js';
import { TokenService, type AccessTokenPayload } from './token.service.js';

/**
 * Глобальная аутентификация (default-deny, I8): каждый маршрут требует
 * валидный access-JWT, кроме помеченных `@Public()`. Верификация stateless
 * (подпись+срок); деактивация пользователя срабатывает в пределах TTL
 * access-токена (≤15 мин) — README модуля. Кладёт AuthUser в request
 * (REQUEST_USER_KEY) для `@GetUser()` и PermissionGuard.
 *
 * Регистрация — APP_GUARD в AppModule ПЕРЕД PermissionGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractBearer(request);
    if (!token) {
      throw DomainException.unauthenticated();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.tokenService.verifyAccessToken(token);
    } catch {
      throw DomainException.unauthenticated('Access token expired or invalid');
    }

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
      permissions: payload.permissions,
    };
    (request as FastifyRequest & { [REQUEST_USER_KEY]?: AuthUser })[REQUEST_USER_KEY] = user;
    return true;
  }

  private extractBearer(request: FastifyRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
