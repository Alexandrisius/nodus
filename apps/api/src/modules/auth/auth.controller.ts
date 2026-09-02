import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  changePasswordSchema,
  loginSchema,
  type AuthTokens,
  type AuthUser,
  type ChangePasswordDto,
  type LoginDto,
  type SessionInfo,
} from '@nodus/contracts';

import { Audit } from '../../core/decorators/audit.decorator.js';
import { GetUser } from '../../core/decorators/get-user.decorator.js';
import { Public } from '../../core/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { TokenService } from './token.service.js';

function clientIp(request: FastifyRequest): string {
  return request.ip;
}

function userAgent(request: FastifyRequest): string | null {
  return request.headers['user-agent'] ?? null;
}

/**
 * Эндпоинты auth (`/api/v1/auth`). Refresh-токен — только в httpOnly-cookie
 * `nodus_refresh` (path=/api/v1/auth, SameSite=Lax, Secure в production);
 * в теле — access-JWT и его TTL (контракт AuthTokens).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Audit({ action: 'auth.login' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokens> {
    const issued = await this.authService.login(
      dto.email,
      dto.password,
      clientIp(request),
      userAgent(request),
    );
    this.setRefreshCookie(reply, issued);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokens> {
    const issued = await this.authService.refresh(
      this.readRefreshCookie(request),
      clientIp(request),
      userAgent(request),
    );
    this.setRefreshCookie(reply, issued);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Audit({ action: 'auth.logout' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logout(this.readRefreshCookie(request));
    this.clearRefreshCookie(reply);
  }

  @Post('logout-all')
  @HttpCode(204)
  @Audit({ action: 'auth.logout_all' })
  async logoutAll(
    @GetUser() user: AuthUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.clearRefreshCookie(reply);
  }

  @Get('me')
  me(@GetUser() user: AuthUser): Promise<AuthUser> {
    // Перечитываем из БД: свежие права и имя, а не снимок из JWT.
    return this.authService.getMe(user.id);
  }

  @Get('sessions')
  sessions(@GetUser() user: AuthUser, @Req() request: FastifyRequest): Promise<SessionInfo[]> {
    return this.authService.listSessions(user.id, this.currentSessionId(request));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Audit({ action: 'auth.session_revoke', entity: 'session' })
  revokeSession(
    @GetUser() user: AuthUser,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.authService.revokeSession(user.id, id, this.currentSessionId(request));
  }

  @Post('change-password')
  @HttpCode(204)
  @Audit({ action: 'auth.change_password' })
  async changePassword(
    @GetUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.authService.changePassword(
      user.id,
      dto.oldPassword,
      dto.newPassword,
      this.currentSessionId(request),
    );
  }

  /** sid текущей сессии из refresh-cookie (для пометки current в списке). */
  private currentSessionId(request: FastifyRequest): string | null {
    return this.tokenService.parseRefreshCookie(this.readRefreshCookie(request))?.sessionId ?? null;
  }

  private readRefreshCookie(request: FastifyRequest): string | undefined {
    const name = this.tokenService.config.refreshCookieName;
    return (request.cookies as Record<string, string | undefined>)[name];
  }

  private setRefreshCookie(reply: FastifyReply, issued: IssuedSession): void {
    const config = this.tokenService.config;
    void reply.setCookie(config.refreshCookieName, `${issued.sessionId}.${issued.refreshToken}`, {
      path: config.refreshCookiePath,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: config.refreshTtlDays * 24 * 60 * 60,
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    const config = this.tokenService.config;
    void reply.clearCookie(config.refreshCookieName, { path: config.refreshCookiePath });
  }
}
