import type { NotificationKind } from '../notifications/notifications.schemas.js';

/** UI-строки модуля уведомлений (#100): секция вынесена из ru.ts (I5). */
export const notificationsStrings = {
  /** Экран «Главная» — личный центр (вердикт 30.09: первый слот меню). */
  homeTitle: 'Главная',
  /** Заголовок ленты на Главной (личный старт: метрики-дела-люди). */
  feedTitle: 'УВЕДОМЛЕНИЯ',
  /** Деградация домена (I10/G4): журнал недоступен — витрина жива. */
  feedUnavailable: 'Журнал уведомлений недоступен',
  /** Секция важного: иерархия блоков = иерархия ярусов (срочно → личное → действия). */
  attentionSection: 'ТРЕБУЮТ ВНИМАНИЯ',
  backgroundSection: 'ФОН',
  showAllBackground: 'Показать все фоновые',
  allClean: 'Всё разобрано',
  allCleanHint: 'Новых важных уведомлений нет',
  /** Табы-фильтры ленты (Slack-паттерн: All/Mentions/…; один всегда активен). */
  pillAll: 'Все',
  pillUrgent: 'Срочные',
  pillMentions: 'Упоминания',
  pillActions: 'Действия',
  searchPlaceholder: 'Поиск…',
  searchEmpty: 'Ничего не найдено',
  /** Группировка по источнику (Telegram): счётчик в строке. */
  groupedMore: 'ещё',
  /** Cap отображения (E9). */
  overLimit: '999+',
  /** Метки ярусов в строке (E11: контраст в обеих темах). */
  tierUrgent: 'Срочно',
  tierPersonal: 'Личное',
  tierAction: 'Действие',
  tierBackground: 'Фон',
  /** Заголовок строки по kind (без гендера: существительные). */
  kindTitles: {
    'urgent.message': 'Срочное сообщение',
    'chat.direct_message': 'Личное сообщение',
    'chat.mention': 'Упоминание',
    'chat.thread_reply': 'Ответ в обсуждении',
    'chat.channel_post': 'Запись в канале',
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
  /** Мета срочного сообщения в чате (отправитель, live по WS). */
  urgentMeta: 'Срочно',
  urgentAcksMeta: 'Ознакомились',
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
  dndHint: 'Тосты отключаются, срочные сообщения пробиваются',
  /** Узкая панель деталей (фидбек владельца 01.10: не на весь экран). */
  detailTitle: 'Уведомление',
  detailOpenSource: 'Перейти к источнику',
  /** Явное гашение одного уведомления из карточки (без перехода в чат). */
  detailReadOne: 'Прочитать',
  /** Onboarding (Linear-паттерн, первые дни). */
  onboardingTitle: 'Ваша Главная',
  onboardingBody:
    'Здесь собирается всё, что требует вашего внимания: срочные сообщения, личные обращения и поручения. Фоновые события не отвлекают — они ниже, в свёрнутом виде.',
};

export type NotificationsStrings = typeof notificationsStrings;
