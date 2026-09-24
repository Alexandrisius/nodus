import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '#lib/utils';

/**
 * Switch (shadcn-примитив, пока БЕЗ потребителей в приложении — автоудаление
 * сообщений убрано из продукта решением владельца 24.09.2026, #96).
 *
 * ГЕОМЕТРИЯ — ЦЕЛЫЕ px на нашем масштабе (--ui-scale 1.25, корневой font-size
 * 20px): rem-высоты дорожки давали дробные зазоры вокруг кружка (1.15rem →
 * 23px при кружке 20px = по 1.5px сверху/снизу), и субпиксельное округление
 * разводило их НЕСИММЕТРИЧНО — кружок визуально смещался по вертикали (находка
 * владельца 24.09.2026, #96). Дорожка default 1.2rem = 24px при кружке
 * size-4 = 20px → зазоры ровно по 2px; sm 1.05rem = 21px при кружке size-3 =
 * 15px → по 3px.
 * ПРЕДОСТЕРЕЖЕНИЕ: возвращая дробные rem-высоты (или меняя size кружка/дорожки
 * порознь), сверь зазоры в ЦЕЛЫХ px при масштабе 1.25 — иначе та же асимметрия
 * всплывёт снова (дробная геометрия при 1.25 округляется врозь).
 */
function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[size=default]:h-[1.2rem] data-[size=default]:w-[2rem] data-[size=sm]:h-[1.05rem] data-[size=sm]:w-[1.5rem] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
