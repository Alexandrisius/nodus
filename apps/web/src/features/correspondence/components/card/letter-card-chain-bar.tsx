import { Mail, ScanLine } from 'lucide-react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { DomainChain, type ChainNode } from '../../../../shared/ui/domain-chain.js';
import { StageChip } from '../../../../shared/ui/stage-chip.js';
import { letterNumber } from '../../lib/letter-format.js';

/**
 * Полоса цепочки карточки письма (h-14 над зонами, анатомия карточки
 * задачи): само-узел «ПИСЬМО · Вх-2026/118» (у незарегистрированного — «без
 * номера»; тема — одна, в заголовке слайдера), чип статуса маршрута и
 * источник — как письмо попало в систему. Резолюции и поручения (#463)
 * встанут сюда же следующими узлами. Бордюр — структура, контент — fade.
 */
export function LetterCardChainBar({ letter }: { letter: LetterDetail }) {
  const nodes: ChainNode[] = [
    { caption: ui.letters.letter, ref: letterNumber(letter), active: true },
  ];
  const Source = letter.source === 'manual' ? ScanLine : Mail;

  return (
    <div className="shrink-0 border-b border-border">
      <div className="content-fade flex h-14 items-center gap-3 px-5">
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <DomainChain nodes={nodes} />
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Source className="size-3.5" strokeWidth={1.75} aria-hidden />
          {ui.letters.source[letter.source]}
        </span>
        <StageChip name={letter.stage.name} color={letter.stage.color} />
      </div>
    </div>
  );
}
