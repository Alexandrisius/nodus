/**
 * Батчер инвалидаций (раунд 3, «буря рефечей»): WS-события приходят пачками
 * (30–40 сообщ/с → столько же инвалидаций → рефечи, каждый пересобирает ленту
 * и список бесед — «мерцание как перезагрузка»). Решение — коалесцинг: ключи
 * собираются в окне, по его закрытию каждый ключ инвалидируется ОДИН раз.
 *
 * Два яруса окон (гистерезис списка): feed (~150 мс) — ленты/треды/точки,
 * list (~600 мс) — список бесед: сортировка по активности пересчитывается
 * существенно реже, чем появляются сообщения (порядок меняется один раз за
 * пачку, а не на каждое событие). Окно открывается ПЕРВЫМ ключом яруса
 * (trailing edge, не продлевается) — максимальная добавленная задержка
 * равна окну; для feed она перекрыта локальным применением message_sent
 * (ws-apply), для list — не критична (бейджи/превью догоняют).
 */

export type InvalidationTier = 'feed' | 'list';

export interface KeyBatcherOptions {
  /** Длительность окна по ярусам (мс). */
  windowMs?: Partial<Record<InvalidationTier, number>>;
  /** Планировщик флаша (инъекция для тестов на fake-таймерах). */
  schedule?: (fn: () => void, ms: number) => () => void;
}

const DEFAULT_WINDOW_MS: Record<InvalidationTier, number> = { feed: 150, list: 600 };

export interface KeyBatcher {
  /** Добавить ключ в окно яруса; первый ключ яруса открывает окно. */
  push: (key: readonly unknown[], tier: InvalidationTier) => void;
  /** Немедленно инвалидировать всё накопленное (смена беседы, dispose). */
  flush: () => void;
  dispose: () => void;
}

export function createKeyBatcher(
  invalidate: (key: readonly unknown[]) => void,
  options: KeyBatcherOptions = {},
): KeyBatcher {
  const windowMs = { ...DEFAULT_WINDOW_MS, ...options.windowMs };
  const schedule =
    options.schedule ??
    ((fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });

  const pending = new Map<InvalidationTier, Map<string, readonly unknown[]>>();
  const cancel = new Map<InvalidationTier, () => void>();

  function flushTier(tier: InvalidationTier): void {
    cancel.delete(tier);
    const keys = pending.get(tier);
    if (!keys || keys.size === 0) return;
    pending.set(tier, new Map());
    for (const key of keys.values()) invalidate(key);
  }

  return {
    push(key, tier) {
      let keys = pending.get(tier);
      if (!keys) {
        keys = new Map();
        pending.set(tier, keys);
      }
      // Ключи детерминированы (строки/числа из chatKeys) — стабильная
      // сериализация для дедупа внутри окна.
      keys.set(JSON.stringify(key), key);
      if (!cancel.has(tier)) {
        cancel.set(
          tier,
          schedule(() => flushTier(tier), windowMs[tier]),
        );
      }
    },
    flush() {
      for (const tier of pending.keys()) flushTier(tier);
    },
    dispose() {
      for (const cancelTier of cancel.values()) cancelTier();
      cancel.clear();
      pending.clear();
    },
  };
}
