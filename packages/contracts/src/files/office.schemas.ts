import { z } from 'zod';

/**
 * Контракты движка просмотра офисных вложений ONLYOFFICE (#138, M9 фаза 2).
 * Сессия документа собирается ЦЕЛИКОМ на сервере (document + editorConfig):
 * фронт передаёт объекты в DocsAPI.DocEditor дословно — JWT-подпись
 * гарантирует, что конфиг не изменён между выдачей и открытием редактора.
 */

export const officeModeSchema = z.enum(['view', 'edit']);
export type OfficeMode = z.infer<typeof officeModeSchema>;

/** Query сессии: желаемый режим; edit без права контекста деградирует в view
 *  (право решает сервер — I8, см. OfficeSessionService). */
export const officeSessionQuerySchema = z.object({
  mode: officeModeSchema.default('view'),
});
export type OfficeSessionQuery = z.infer<typeof officeSessionQuerySchema>;

/** Параметры редактора ONLYOFFICE Docs API (подписываются в token). */
export const officeDocumentConfigSchema = z.object({
  /** Расширение файла (fileType в терминах Docs API). */
  fileType: z.string().min(1).max(10),
  /** Идентификатор документа ДЛЯ ко-эдитинга: `${fileId}.v${version}` —
   *  меняется с каждой сохранённой версией (кэш DS не смешивает версии;
   *  алфавит ключа DS — 0-9-.a-zA-Z_=, двоеточие запрещено). */
  key: z.string().min(8),
  title: z.string().min(1),
  /** Абсолютный URL контента, доступный ИЗ КОНТЕЙНЕРА документ-сервера
   *  (не из браузера): внутренний адрес api + HMAC-подпись. */
  url: z.string().url(),
  permissions: z.object({
    edit: z.boolean(),
    download: z.boolean(),
    print: z.boolean(),
  }),
});
export type OfficeDocumentConfig = z.infer<typeof officeDocumentConfigSchema>;

export const officeEditorConfigSchema = z.object({
  mode: officeModeSchema,
  lang: z.string().min(2),
  /** Callback сохранений — внутренний адрес api, доступный документ-серверу. */
  callbackUrl: z.string().url(),
  user: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  customization: z.object({
    /** Кнопка сохранения не ждёт автосейва (callback status 6). */
    forcesave: z.boolean(),
    /** Компактная шапка редактора — одна строка тулбара. */
    compactHeader: z.boolean(),
    /** «О программе» — инфо о разработчике ONLYOFFICE (CE-кредит). */
    about: z.boolean(),
    /** Кнопка обратной связи (сайт вендора) — выключена. */
    feedback: z.boolean(),
    /** Вкладка «Плагины» (AI, маркетплейс и пр.) — выключена. */
    plugins: z.boolean(),
  }),
});
export type OfficeEditorConfig = z.infer<typeof officeEditorConfigSchema>;

export const officeSessionSchema = z.object({
  fileId: z.uuid(),
  name: z.string().min(1),
  mime: z.string().min(1),
  size: z.number().int().min(0),
  /** Текущая версия файла (document.key растёт с версией). */
  version: z.number().int().min(1),
  mode: officeModeSchema,
  /** Право правки в этом контексте (кнопка «Редактировать»). */
  canEdit: z.boolean(),
  documentType: z.enum(['word', 'cell', 'slide', 'pdf']),
  document: officeDocumentConfigSchema,
  editorConfig: officeEditorConfigSchema,
  /** JWT (HS256, секрет документ-сервера) над document + editorConfig. */
  token: z.string().min(20),
});
export type OfficeSession = z.infer<typeof officeSessionSchema>;

/** `GET /files/office-config` — параметры движка для фронт-реестра
 *  (без сессии: фолбэк до попытки открыть без обращения к api). */
export const officeConfigSchema = z.object({
  enabled: z.boolean(),
  editEnabled: z.boolean(),
  /** Потолок размера файла на открытие в редакторе (больше — скачивание). */
  maxViewBytes: z.number().int().min(1),
});
export type OfficeConfig = z.infer<typeof officeConfigSchema>;

/** Пункт списка версий файла. */
export const officeVersionSchema = z.object({
  version: z.number().int().min(1),
  size: z.number().int().min(0),
  mime: z.string().min(1),
  createdAt: z.iso.datetime(),
  /** Подписанная ссылка контента версии (null, если выпуск недоступен). */
  url: z.string().nullable(),
});
export type OfficeVersion = z.infer<typeof officeVersionSchema>;

export const officeVersionListSchema = z.object({
  items: z.array(officeVersionSchema),
});
export type OfficeVersionList = z.infer<typeof officeVersionListSchema>;
