export const BETA_READER = Symbol('BETA_READER');

export interface BetaReader {
  count(): Promise<number>;
}
