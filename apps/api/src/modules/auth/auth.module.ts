import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AUTH_PROVIDER } from './auth-provider.js';
import { getAuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { UserDeactivatedHandler } from './events/user-deactivated.handler.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LocalAuthProvider } from './local-auth.provider.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { TokenService } from './token.service.js';

/**
 * Модуль auth (ядро): логин, JWT/refresh с ротацией, сессии.
 * AuthProvider — точка расширения (I13): сейчас LocalAuthProvider,
 * Keycloak/LDAP в V2 за тем же токеном. JwtAuthGuard экспортируется —
 * глобальная регистрация (APP_GUARD, первым) в AppModule.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getAuthConfig().jwtSecret,
      signOptions: { expiresIn: getAuthConfig().accessTtlSeconds },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    JwtAuthGuard,
    UserDeactivatedHandler,
    LoginThrottleService,
    { provide: AUTH_PROVIDER, useClass: LocalAuthProvider },
  ],
  exports: [JwtAuthGuard, TokenService, JwtModule],
})
export class AuthModule {}
