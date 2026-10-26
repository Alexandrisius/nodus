import { ui } from '@nodus/contracts';

const HINTS = [
  ui.letters.pipeline.keyRegister,
  ui.letters.pipeline.keyNeighbours,
  ui.letters.pipeline.keySpam,
];

/** Строка-подсказка клавиатуры конвейера (#55): сочетание — моно-плашкой,
 *  действие — словами; переносится в узкой панели. */
export function PipelineHints() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {HINTS.map((hint) => {
        const [keys, action] = hint.split(' — ');
        return (
          <li key={hint} className="flex items-center gap-1">
            <kbd className="rounded border border-border px-1 font-mono text-[10px] text-secondary-foreground">
              {keys}
            </kbd>
            <span>{action}</span>
          </li>
        );
      })}
    </ul>
  );
}
