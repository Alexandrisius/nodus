import { Sparkles } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';

import { useAuthStore } from '../../../shared/auth-store.js';
import { LATEST_RELEASE } from '../model/releases.js';
import { isUnseen, useWhatsNewStore } from '../model/whats-new-store.js';

/**
 * Кнопка «Что нового» в топбаре (#386): открывает панель с историей
 * обновлений; точка — последний выпуск этим пользователем ещё не просмотрен
 * (обычно гаснет автопоказом сразу после входа). Выпусков нет — кнопки нет.
 */
export function WhatsNewButton() {
  const userId = useAuthStore((s) => s.user?.id);
  const unseen = useWhatsNewStore((s) => isUnseen(s.seen, userId, LATEST_RELEASE?.version));
  const show = useWhatsNewStore((s) => s.show);

  if (!LATEST_RELEASE) return null;
  const version = LATEST_RELEASE.version;
  const label = unseen ? `${ui.whatsNew.open} — ${ui.whatsNew.unseen}` : ui.whatsNew.open;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => show(userId, version, 'manual')}
      className="relative text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Sparkles />
      {unseen && <span className="absolute top-1 right-1 size-2 rounded-full bg-info" />}
    </Button>
  );
}
