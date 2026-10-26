import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '#lib/utils';

/**
 * Switch — ОДИН размер на всё приложение (вердикт владельца 26.10.2026, #432:
 * «толстые» переключатели запрещены — везде такой же, как в матрице прав
 * #379). Размерного пропа нет и не добавлять: второй габарит снова
 * расползётся по экранам.
 *
 * Анатомия (трек 28×16, кружок 12, зазор 2, ход 12 — 7onic/Comitor/Coolify
 * design systems): кружок = 0.75 высоты трека, иначе «ячейка больше
 * кружка» (замечание владельца 26.10). Рамки нет: при border-box её 1px
 * входил в высоту и зазор становился несимметричным; отступ — только
 * padding, ход = ширина − 2·padding − кружок.
 *
 * ГЕОМЕТРИЯ — ЦЕЛЫЕ px на нашем масштабе (--ui-scale 1.25, корневой
 * font-size 20px): 0.8rem = 16, 1.4rem = 28, 0.1rem = 2, 0.6rem = 12.
 * Дробные rem-высоты округлялись врозь, и кружок визуально смещался по
 * вертикали (находка владельца 24.09.2026, #96). Меняя габарит, сверь
 * зазоры в целых px при масштабе 1.25.
 *
 * В строке «подпись слева — тумблер справа» трек центрируется по ПЕРВОЙ
 * строке подписи: обёртка высотой в line-height текста (`SwitchRow`,
 * `SettingRow`), а не `items-start` по верхнему краю.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group/switch relative inline-flex h-[0.8rem] w-[1.4rem] shrink-0 items-center rounded-full p-[0.1rem] transition-all outline-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-1 focus-visible:ring-ring aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[0.6rem] rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[0.6rem] data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
