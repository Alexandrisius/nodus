/**
 * Планировщик квитанций просмотров (#102 раунд 2): «просмотр = видимость в
 * вьюпорте» — источник (visibility-стор MessageScroller или свой
 * IntersectionObserver ленты каналов) сообщает seq самой НОВОЙ видимой
 * строки; квитанция уходит троттлом (~500 мс) и только ВПЕРЁД. Свёрнутый/
 * скрытый таб не просматривает: pending ждёт возврата видимости.
 * Уход из беседы — flush(): хвост ниже вьюпорта квитанцией не становится.
 */
export const READ_RECEIPT_THROTTLE_MS = 500;

export interface ReadReceiptScheduler {
  /** Сообщить seq самой новой видимой строки (null — ничего не видно). */
  observe(maxVisibleSeq: number | null): void;
  /** Отправить накопленное немедленно (без guard-а скрытости: это видели). */
  flush(): void;
  /** Сбросить без отправки. */
  dispose(): void;
}

export function createReadReceiptScheduler(options: {
  send: (upToSeq: number) => void;
  throttleMs?: number;
  isHidden?: () => boolean;
}): ReadReceiptScheduler {
  const throttleMs = options.throttleMs ?? READ_RECEIPT_THROTTLE_MS;
  const isHidden = options.isHidden ?? (() => document.visibilityState !== 'visible');
  let pending: number | null = null;
  let sentSeq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    timer = null;
    if (pending === null || pending <= sentSeq) {
      pending = null;
      return;
    }
    if (isHidden()) return; // повторная попытка — следующим observe/возвратом видимости
    sentSeq = pending;
    const seq = pending;
    pending = null;
    options.send(seq);
  };

  return {
    observe(maxVisibleSeq) {
      if (maxVisibleSeq === null || maxVisibleSeq <= sentSeq) return;
      if (pending !== null && maxVisibleSeq <= pending) {
        // назад — не двигаем; но если прошлый fire заблокировала скрытость,
        // перевзводим таймер (pending ждёт возврата видимости)
        if (timer === null) timer = setTimeout(fire, throttleMs);
        return;
      }
      pending = maxVisibleSeq;
      if (timer === null) {
        timer = setTimeout(fire, throttleMs);
      }
    },
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending !== null && pending > sentSeq) {
        sentSeq = pending;
        const seq = pending;
        pending = null;
        options.send(seq);
      } else {
        pending = null;
      }
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
  };
}
