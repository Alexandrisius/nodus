// Фикстура: read-порт чужого модуля (ADR-0012) — единственный разрешённый межмодульный импорт.
import { BetaPortsModule } from '../beta/beta-ports.module.js';
import { BETA_READER, type BetaReader } from '../beta/beta-reader.port.js';

export const wiring: [symbol, typeof BetaPortsModule] = [BETA_READER, BetaPortsModule];
export type Reader = BetaReader;
