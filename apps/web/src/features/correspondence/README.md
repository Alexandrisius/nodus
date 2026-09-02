# features/correspondence

Письма: журнал (входящие/исходящие/незарегистрированные — секции в топбаре),
карточка-слайдер с вложениями и резолюциями, «В поручение» (поток А), регистрация письма.

- Контракты: `LetterListItem`, `LetterDetail`, `Resolution` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /letters?folder=`, `GET /letters/:id`,
  `POST /letters/:id/resolutions`, `POST /letters/:id/register`.
- Мутации `useIssueResolution`/`useRegisterLetter` — **пессимистичные обоснованно**:
  юридически значимые действия (регномер, поручение) — сервер авторитетен; списки
  инвалидируются в onSettled.
