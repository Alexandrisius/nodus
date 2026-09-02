# features/projects

Проекты: список (роль, приватность, участники) и панель-слайдер.
`ProjectSliderPage` работает на двух уровнях стека: `/projects/:id` (уровень 1)
и `/tasks/:taskId/project/:id` (уровень 2 поверх карточки задачи, §10.2).

- Контракты: `ProjectListItem`, `ProjectRef` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /projects`, `GET /projects/:id`.
