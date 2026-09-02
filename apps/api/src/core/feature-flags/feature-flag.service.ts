import { Injectable } from '@nestjs/common';

import { FeatureFlagRepository } from './feature-flag.repository.js';

/** Короткий TTL кэша: тумблер применяется за секунды, без пересборки (I10). */
const CACHE_TTL_MS = 5_000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

/**
 * Фичефлаги (I10): не-ядровые модули отключаемы без пересборки.
 * Неизвестный флаг считается выключенным (безопасный дефолт).
 */
@Injectable()
export class FeatureFlagService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly repository: FeatureFlagRepository) {}

  async isEnabled(key: string): Promise<boolean> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.enabled;
    }
    const enabled = (await this.repository.findEnabled(key)) ?? false;
    this.cache.set(key, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  }

  /** Управление флагом (админка — отдельный issue); сбрасывает кэш ключа. */
  async setEnabled(key: string, enabled: boolean): Promise<void> {
    await this.repository.setEnabled(key, enabled);
    this.cache.delete(key);
  }
}
