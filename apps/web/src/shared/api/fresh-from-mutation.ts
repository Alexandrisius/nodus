/**
 * «Свежо из мутации» (#378, отклик панели процесса): задача, чьи деталь и
 * кнопки только что записаны в кэш из ОТВЕТА собственной мутации. Эхо её же
 * события по WebSocket (сервер шлёт событие и актёру) в окне TTL не
 * перезапрашивает деталь/кнопки повторно — иначе один клик давал три волны
 * запросов. Доски и журнал по эху обновляются как обычно (фильтры, порядок).
 */
const FRESH_TTL_MS = 2_000;
const freshUntil = new Map<string, number>();

export function markFreshFromMutation(taskId: string, now = Date.now()): void {
  freshUntil.set(taskId, now + FRESH_TTL_MS);
}

export function isFreshFromMutation(taskId: string, now = Date.now()): boolean {
  const until = freshUntil.get(taskId);
  if (until === undefined) return false;
  if (until <= now) {
    freshUntil.delete(taskId);
    return false;
  }
  return true;
}
