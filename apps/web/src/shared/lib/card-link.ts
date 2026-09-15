import { toast } from 'sonner';
import { ui } from '@nodus/contracts';

/** Deep-link на карточку сущности стека (ADR-0009): `?cards=kind:id`
 *  открывает тот же модуль с карточкой поверх (восстановление из URL уже
 *  работает). «Копировать ссылку» — пункт меню строк всех журналов
 *  (вердикт владельца 15.09.2026). Тип — структурный (shared не знает
 *  о app/shell). */
export function cardLink(ref: { kind: string; id: string }): string {
  return `${window.location.origin}${window.location.pathname}?cards=${ref.kind}:${ref.id}`;
}

/** Скопировать ссылку на карточку в буфер + тост подтверждения. */
export async function copyCardLink(ref: { kind: string; id: string }): Promise<void> {
  try {
    await navigator.clipboard.writeText(cardLink(ref));
    toast.success(ui.common.linkCopied);
  } catch {
    toast.error(ui.common.copyError);
  }
}
