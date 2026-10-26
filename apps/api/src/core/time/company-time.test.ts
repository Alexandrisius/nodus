import { describe, expect, it } from 'vitest';

import {
  companyDate,
  companyTimeZone,
  companyYear,
  DEFAULT_COMPANY_TIMEZONE,
} from './company-time.js';

describe('company-time (#55, F7)', () => {
  it('граница года — по Минску, а не по UTC', () => {
    // 31.12.2026 23:30 UTC = 01.01.2027 02:30 в Минске (UTC+3).
    const at = new Date('2026-12-31T23:30:00.000Z');
    expect(companyYear(at, 'Europe/Minsk')).toBe(2027);
    expect(companyYear(at, 'UTC')).toBe(2026);
  });

  it('дата регистрации — день Минска', () => {
    expect(companyDate(new Date('2026-12-31T23:30:00.000Z'), 'Europe/Minsk')).toBe('2027-01-01');
    expect(companyDate(new Date('2026-10-27T08:00:00.000Z'), 'Europe/Minsk')).toBe('2026-10-27');
  });

  it('пояс по умолчанию — Europe/Minsk, env переопределяет', () => {
    expect(companyTimeZone({})).toBe(DEFAULT_COMPANY_TIMEZONE);
    expect(companyTimeZone({ COMPANY_TIMEZONE: ' ' })).toBe(DEFAULT_COMPANY_TIMEZONE);
    expect(companyTimeZone({ COMPANY_TIMEZONE: 'UTC' })).toBe('UTC');
  });
});
