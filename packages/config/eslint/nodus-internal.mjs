import { builtinRules } from 'eslint/use-at-your-own-risk';

const maxLines = builtinRules.get('max-lines');

/**
 * Внутренний псевдоплагин: даёт второе имя для core-правила max-lines,
 * чтобы одновременно держать два порога I5 — предупреждение > 300 и ошибку > 500
 * (в flat config одно правило нельзя назначить дважды с разной severity).
 */
export const nodusInternal = {
  rules: {
    'max-lines-warn': maxLines,
  },
};
