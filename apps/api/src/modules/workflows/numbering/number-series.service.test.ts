import { ErrorCode } from '@nodus/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { NumberSeriesService } from './number-series.service.js';

const SERIES_ID = '00000000-0000-4000-8000-000000000501';
const TYPE_ID = '00000000-0000-4000-8000-000000000502';

function txOf(overrides: {
  typeConfig?: unknown;
  series?: { id: string; prefix: string } | null;
  lastValue?: number;
}) {
  const tx = {
    processType: { findUnique: vi.fn().mockResolvedValue({ config: overrides.typeConfig ?? {} }) },
    numberSeries: { findUnique: vi.fn().mockResolvedValue(overrides.series ?? null) },
    $queryRaw: vi.fn().mockResolvedValue([{ last_value: overrides.lastValue ?? 1 }]),
  };
  return tx as unknown as TransactionClient & typeof tx;
}

describe('NumberSeriesService (#55, Р2)', () => {
  it('номер типа без серии — 409 WORKFLOW_NUMBERING_NOT_CONFIGURED', async () => {
    const service = new NumberSeriesService();
    const tx = txOf({ typeConfig: { card: {}, access: {} } });
    await expect(service.nextForType(tx, TYPE_ID)).rejects.toMatchObject({
      code: ErrorCode.WORKFLOW_NUMBERING_NOT_CONFIGURED,
    });
  });

  it('номер по серии типа: «Вх-ГГГГ/N», год — по Минску', async () => {
    const service = new NumberSeriesService();
    const tx = txOf({
      typeConfig: { numbering: { seriesId: SERIES_ID } },
      series: { id: SERIES_ID, prefix: 'Вх' },
      lastValue: 118,
    });
    // 31.12.2026 23:30 UTC = 01.01.2027 02:30 в Минске.
    const number = await service.nextForType(tx, TYPE_ID, new Date('2026-12-31T23:30:00.000Z'));
    expect(number).toMatchObject({
      seriesId: SERIES_ID,
      year: 2027,
      seq: 118,
      display: 'Вх-2027/118',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('отсутствующая серия — 409, а не «номер без префикса»', async () => {
    const service = new NumberSeriesService();
    const tx = txOf({ series: null });
    await expect(service.next(tx, SERIES_ID)).rejects.toMatchObject({
      code: ErrorCode.WORKFLOW_NUMBERING_NOT_CONFIGURED,
    });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
