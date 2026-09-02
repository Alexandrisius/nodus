# Модуль auth (ядро)

Логин, JWT/refresh, сессии. Аутентификация — глобальный `JwtAuthGuard`
(default-deny, I8): закрыто всё, кроме `@Public()` (health, `/auth/login`, `/auth/refresh`, `/auth/logout`).

## Контракты (`@nodus/contracts`)

`loginSchema`, `authTokensSchema`, `changePasswordSchema`, `sessionInfoSchema`, `AuthUser`, `Permission`.

## Эндпоинты (`/api/v1/auth`)

| Метод  | Маршрут            | Доступ          | Назначение                                            |
| ------ | ------------------ | --------------- | ----------------------------------------------------- |
| POST   | `/login`           | public          | email+пароль → access-JWT + refresh-cookie            |
| POST   | `/refresh`         | public (cookie) | ротация refresh, новый access                         |
| POST   | `/logout`          | public (cookie) | отзыв текущей сессии (идемпотентен)                   |
| POST   | `/logout-all`      | auth            | отзыв всех сессий                                     |
| GET    | `/me`              | auth            | AuthUser (перечитывается из БД — свежие права/статус) |
| GET    | `/sessions`        | auth            | активные сессии (current помечена)                    |
| DELETE | `/sessions/:id`    | auth            | отзыв чужой сессии (текущую — только logout)          |
| POST   | `/change-password` | auth            | проверка старого; отзыв остальных сессий              |

## Механика

- **Пароли**: Argon2id (RFC 9106: 64 MiB / t=3 / p=4) через core `PasswordService`; `needsRehash` — прозрачный апгрейд при логине; dummy-hash против user-enumeration; политика 12+ символов (zod в contracts).
- **Access-JWT**: 15 мин (`JWT_ACCESS_TTL_SECONDS`), payload = AuthUser + `sid`; stateless — деактивация пользователя срабатывает на произвольных эндпоинтах в пределах TTL (`/auth/me` перечитывает БД и отвечает 401 сразу).
- **Refresh**: opaque-токен 30 дней в httpOnly-cookie `nodus_refresh` (path `/api/v1/auth`, SameSite=Lax, Secure в production). Формат `<sessionId>.<token>` — поиск сессии по PK. В БД только SHA-256 хэши (текущий + предыдущий).
- **Ротация с reuse-detection**: предъявление предыдущего (сменённого) токена ПОСЛЕ leeway-окна 10 с = компрометация → отзыв всей сессии + аудит `auth.session_reuse_detected` (подход Auth0). В пределах окна — гонка параллельных refresh (мультитаб/ретрай), ротируем штатно; SPA дополнительно дедуплицирует refresh одним in-flight запросом.
- **Брутфорс-защита**: пер-аккаунтный счётчик неудач в Redis (`LoginThrottleService`, 10 неудач / 10 минут, сброс при успехе) — устойчив к NAT офиса; ответ не выдаёт факт блокировки (тот же `AUTH_INVALID_CREDENTIALS`), аудит `auth.login_throttled`. Принятый трейдофф OWASP: lockout-DoS — злоумышленник может держать чужую учётку на паузе, зная email (смягчение: окно 10 минут, без накопления). Плюс базовый rate-limit 300/мин по IP (main.ts, в `NODE_ENV=test` выключен).
- **Смена пароля**: отзывает все сессии, кроме текущей (по refresh-cookie; запрос без cookie считается «без текущей» — отзовутся все).
- **Аудит**: `auth.login` / `auth.login_failed` (из сервиса, с email) / `auth.logout*`, `auth.change_password`, `auth.session_revoke`.

## События

- Подписчик `directory.user.deactivated` (`events/user-deactivated.handler.ts`) — отзыв всех сессий деактивированного.

## Точка расширения (I13)

`AuthProvider` (токен `AUTH_PROVIDER`): `verifyCredentials(email, password) → AuthIdentity | null`.
Сейчас — `LocalAuthProvider`; Keycloak/LDAP в V2 подменяют реализацию без смены контрактов.

## Конфигурация (env)

`JWT_SECRET` (≥32, обязателен), `JWT_ACCESS_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS` (30), `COOKIE_SECURE` (по умолчанию = `NODE_ENV=production`).

## Лимиты

- Сессия: скользящие 30 дней; список сессий — без пагинации (десятки на пользователя).
- Нет TOTP 2FA и password-reset (V2, за `AuthProvider` и почтой).
