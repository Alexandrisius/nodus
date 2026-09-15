/**
 * Чистая логика разрешения персонального порядка (концепт #4): три слоя —
 * системный дефолт реестра ← общий компании ← личный; действует самый
 * «личный» из ЗАДАННЫХ. Слияние без миграций: из сохранённого порядка
 * берутся только известные коду id, новые id (появились в реестре после
 * сохранения) дописываются в конец в системном порядке.
 */

/** Порядок id: личный ?? общий ?? системный; неизвестные отбрасываются,
 *  новые — в конец в системном порядке. */
export function resolveOrder(
  systemIds: string[],
  personal?: string[],
  company?: string[],
): string[] {
  const stored = personal?.length ? personal : company?.length ? company : undefined;
  if (!stored) return systemIds;
  const known = stored.filter((id) => systemIds.includes(id));
  const fresh = systemIds.filter((id) => !known.includes(id));
  return [...known, ...fresh];
}

/** Скрытые id: личные ?? общие; отбрасываются неизвестные коду. */
export function resolveHidden(
  systemIds: string[],
  personal?: string[],
  company?: string[],
): string[] {
  const stored = personal ?? company;
  if (!stored) return [];
  return stored.filter((id) => systemIds.includes(id));
}
