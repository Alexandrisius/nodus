import { Check, Mic } from 'lucide-react';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { SendHexIcon } from '../ui/send-hex-icon.js';

/** Отправка/галка и мик — ОДИН габарит ghost-кнопки (size-8):
 *  переключение не двигает строку; заливки НЕТ — гексагон в
 *  семье значков, тон темнее (вердикт 24.09, раунды 4–5). */
export function ComposerSendButton({
  sendVisible,
  editing,
  align,
}: {
  sendVisible: boolean;
  /** Режим правки — галка «Сохранить» вместо гексагона. */
  editing: boolean;
  align: string;
}) {
  return sendVisible ? (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      /* Акцент info — тот же токен, что закреп/цитаты/бар
         пересылки (вердикт 24.09: «нравится цвет цитат и
         закрепов»; смена оттенка акцента = одна строка темы). */
      className={cn('shrink-0 text-info', align)}
      aria-label={editing ? ui.common.save : ui.tasks.send}
      title={editing ? ui.common.save : ui.tasks.send}
    >
      {editing ? <Check className="size-5" strokeWidth={2} /> : <SendHexIcon className="size-5" />}
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('shrink-0 text-muted-foreground', align)}
      aria-label={ui.chat.voice}
      title={ui.chat.voice}
      onClick={() => toast(ui.chat.voiceSoon)}
    >
      <Mic strokeWidth={1.75} />
    </Button>
  );
}
