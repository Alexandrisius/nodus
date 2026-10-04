import type { NotificationKind } from '../notifications/notifications.schemas.js';

/** UI-строки модуля уведомлений (#100): секция вынесена из ru.ts (I5). */
export const notificationsStrings = {
  /** Экран «Главная» — личный центр (вердикт 30.09: первый слот меню). */
  homeTitle: 'Главная',
  /** Заголовок ленты на Главной (личный старт: метрики-дела-люди). */
  feedTitle: 'УВЕДОМЛЕНИЯ',
  /** Деградация домена (I10/G4): журнал недоступен — витрина жива. */
  feedUnavailable: 'Журнал уведомлений недоступен',
  /** Секция важного: иерархия блоков = иерархия приоритетов (срочно → высокий → средний). */
  attentionSection: 'ТРЕБУЮТ ВНИМАНИЯ',
  lowSection: 'НИЗКИЙ ПРИОРИТЕТ',
  showAllLow: 'Показать все низкие',
  allClean: 'Всё разобрано',
  allCleanHint: 'Новых важных уведомлений нет',
  /** Табы-фильтры ленты (Slack-паттерн: один всегда активен) + окно «+» (#189).
   *  Терминология #177: пользователь видит ОДНО слово «Важное» везде
   *  (молния, чип пузыря, вкладка, метка приоритета); кодовые имена urgent. */
  pillAll: 'Все',
  pillUrgent: 'Важные',
  pillMentions: 'Упоминания',
  tabAdd: 'Настроить вкладки',
  tabsDialogTitle: 'Вкладки уведомлений',
  tabsDialogCreate: 'Новая вкладка',
  tabsDialogEdit: 'Вкладка',
  tabsNameLabel: 'Название',
  tabsNamePlaceholder: 'Например: Посты каналов',
  tabsPrioritiesLabel: 'Приоритеты',
  tabsKindsLabel: 'Типы событий',
  tabsSystemLabel: 'Системные вкладки',
  tabsSystemHint: 'Вкладка «Все» всегда доступна',
  tabsCreateButton: 'Создать',
  tabsSaveButton: 'Сохранить',
  tabsCancelButton: 'Отмена',
  tabsRename: 'Переименовать',
  tabsDelete: 'Удалить',
  tabsHide: 'Скрыть',
  tabNoResults: 'Ничего не найдено',
  tabAnyFilter: 'без фильтра — все события',
  /** Группировка по источнику (Telegram): счётчик в строке. */
  groupedMore: 'ещё',
  /** Cap отображения (E9). */
  overLimit: '999+',
  /** Метки приоритетов в строке (E11: контраст в обеих темах). */
  priorityUrgent: 'Важное',
  priorityHigh: 'Высокий',
  priorityMedium: 'Средний',
  priorityLow: 'Низкий',
  /** Заголовок строки по kind (без гендера: существительные). */
  kindTitles: {
    'urgent.message': 'Важное сообщение',
    'chat.direct_message': 'Личное сообщение',
    'chat.mention': 'Упоминание',
    'chat.thread_reply': 'Ответ в обсуждении',
    'chat.channel_post': 'Запись в канале',
    'chat.message_edited': 'Сообщение отредактировано',
    'action.assignment': 'Поручение',
    'action.approval': 'Согласование',
    'action.deadline': 'Срок',
  } satisfies Record<NotificationKind, string>,
  /** Колокольчик-поповер (быстрые последние 5–7; массового прочтения нет —
   *   важное гасится осознанно: входом в источник / «Ознакомлен», фидбек 01.10). */
  bellLabel: 'Уведомления',
  bellRecent: 'Последние уведомления',
  bellEmpty: 'Новых уведомлений нет',
  /** Лист ознакомления (СЭД-паттерн «Е-дело»: текст → подпись). */
  ackSheetTitle: 'Ознакомление',
  ackSheetFrom: 'Отправил',
  ackButton: 'Ознакомлен',
  ackScrollHint: 'Прочитайте текст до конца',
  ackDone: 'Вы ознакомлены',
  ackStatus: 'Ознакомились',
  ackStatusOf: 'из',
  ackStatusEmpty: 'Пока никто не ознакомился',
  ackListTitle: 'Кто ознакомился',
  /** Мета важного сообщения в чате (отправитель, live по WS). */
  urgentMeta: 'Важное',
  urgentAcksMeta: 'Ознакомились',
  /** Попап молнии композера (#177): переключатель, чекбокс, счётчик лимита,
   *  исчерпание (инлайн-ошибка и тултип), guardrail ≥20 участников.
   *  Счётчик: `Важных сегодня: 2 из 3` — части собираются клиентом
   *  (urgentToday + ackStatusOf). Guardrail — шаблон с {count}
   *  (одноразовый replace; срабатывает только при ≥20 — множественное
   *  «человек» всегда верно). */
  urgentToggle: 'Важное',
  urgentToggleHint: 'Верхний ярус уведомлений, пробивает «Не беспокоить»',
  urgentRequireAck: 'Требовать подтверждения',
  urgentRequireAckHint: 'Напоминать получателю, пока не подтвердит',
  urgentToday: 'Важных сегодня:',
  urgentLimitReached: 'Лимит важных на сегодня исчерпан',
  urgentGuardrail: 'Вы просите подтверждения у {count} человек. Отправить?',
  urgentGuardrailTitle: 'Подтверждение от участников',
  urgentGuardrailSend: 'Отправить',
  /** Чип-кнопка ознакомления на пузыре (#177): до нажатия и после. */
  ackChipButton: 'Ознакомлен',
  ackChipDone: 'Ознакомлен ✓',
  /** Тосты: стак личного (каждое отдельно) / сводная карточка действий. */
  toastNewMessages: 'Новые сообщения',
  toastActionsSummary: 'Требуют внимания',
  toastUrgentRepeat: 'Напоминание',
  toastOpen: 'Открыть',
  /** DND-настройки (подавление тостов, кроме срочного). */
  settingsTitle: 'Уведомления',
  dndLabel: 'Не беспокоить',
  dndFrom: 'с',
  dndTo: 'по',
  dndHint: 'Тосты отключаются, важные сообщения пробиваются',
  /** Узкая панель деталей (фидбек владельца 01.10: не на весь экран). */
  detailTitle: 'Уведомление',
  detailOpenSource: 'Перейти к источнику',
  /** Явное гашение одного уведомления из карточки (без перехода в чат). */
  detailReadOne: 'Прочитать',
  /** Onboarding (Linear-паттерн, первые дни). */
  onboardingTitle: 'Ваша Главная',
  onboardingBody:
    'Здесь собирается всё, что требует вашего внимания: важные сообщения, личные обращения и поручения. Низкий приоритет не отвлекает — он ниже, в свёрнутом журнале.',
};

export type NotificationsStrings = typeof notificationsStrings;
