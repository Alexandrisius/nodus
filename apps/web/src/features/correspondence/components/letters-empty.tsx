import { TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nodus/ui/components/empty';

/** Пустая вкладка писем (NN/g): что здесь появится и откуда, главное
 *  действие — если есть. Одна форма у конвейера «Новые» и журналов. */
export function LettersEmpty({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{hint}</EmptyDescription>
        </EmptyHeader>
        {children ? <EmptyContent>{children}</EmptyContent> : null}
      </Empty>
    </div>
  );
}

/** Список не загрузился — объяснение и «Повторить» (без белого экрана). */
export function LettersLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{ui.letters.list.loadError}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            {ui.letters.list.retry}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
