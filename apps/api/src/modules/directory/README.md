# Модуль directory (ядро)

Пользователи, отделы (дерево оргструктуры), должности, роли; карточка сотрудника.
Модель — эпик M2 (#18), требования владельца:

- **Гибкие связи**: `managerId` у сотрудника — подчинённость в пределах группы (ГИП ↔ помощник) без фиктивных отделов.
- **Двойная структура**: управленческая (`kind=management`) и юридическая (`kind=legal`) пары должность/подразделение — первоклассные справочники (I15), не кастомные поля.
- **Руководитель и заместитель** у подразделения (`headId`, `deputyId`) — задел под переадресацию при отсутствиях (модуль замещения — позже, схема готова).
- **Расширяемость профиля**: ядро карточки стабильно; кастомные поля — модуль custom-fields (M10), геймификация/HR — отдельные модули по `user_id`.

## Контракты (`@nodus/contracts`)

`userCardSchema`, `userListItemSchema`, `listUsersQuerySchema`, `createUserSchema`, `updateUserSchema`, `updateMyProfileSchema`; `departmentNodeSchema`, `createDepartmentSchema`; `positionSchema`; `roleSchema`, `createRoleSchema`.

## Эндпоинты (`/api/v1/directory`)

| Маршрут                                                           | Права              | Назначение                                              |
| ----------------------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| `GET /users`                                                      | directory.read     | Список: `?cursor=&limit=&search=&departmentId=&status=` |
| `GET /users/:id`                                                  | directory.read     | Карточка сотрудника                                     |
| `PATCH /users/me`                                                 | auth               | Саморедактирование контактного блока                    |
| `POST /users`, `PATCH /users/:id`, `POST /users/:id/deactivate`   | directory.manage   | Управление сотрудниками                                 |
| `GET /departments/tree?kind=`                                     | directory.read     | Дерево оргструктуры (head/deputy/memberCount)           |
| `POST/PATCH /departments/:id`, `POST /:id/archive`                | directory.manage   | Управление деревом (защита от циклов)                   |
| `GET /positions?kind=`, `POST`, `PATCH /:id`, `POST /:id/archive` | read / manage      | Справочник должностей                                   |
| `GET /roles`, `POST`, `PATCH /:id`, `DELETE /:id`                 | read / role.manage | Роли и состав прав                                      |

## События (outbox, I9)

`directory.user.created` / `directory.user.updated` (payload: userId, changedFields) / `directory.user.deactivated` (payload: userId — auth отзывает сессии); `directory.department.created` / `updated` / `archived`; `directory.position.created` / `updated` / `archived`; `directory.role.created` / `updated` / `deleted`.

## Правила

- Создание сотрудника — только администратором (self-registration нет); начальный пароль — Argon2id через core `PasswordService`.
- Email уникален: предпроверка → `DIRECTORY_EMAIL_TAKEN` (409).
- Архивация вместо удаления: пользователи (status), отделы и должности (isActive), роли — удаляются только несистемные и неназначенные.
- Роли — данные, не код: права из каталога `Permission` контрактов, разворачиваются в JWT при логине.

## Лимиты

- Список пользователей — курсорная пагинация ≤ 100 (по умолчанию 50), поиск по ФИО/email.
- Дерево отделов — целиком (десятки узлов; ленивые уровни — при росте > 1000).
- Замещение (временный зам с периодом) и календарь отсутствий — отдельный issue эпика M2; таблица замещений появится там.
