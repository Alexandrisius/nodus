import type { ComposerSubmit } from './chat-composer.js';

/**
 * Реестр submit-функций хостов композера (#144): окно отправки вложений —
 * глобальный диалог ВНЕ дерева панелей, но отправка обязана идти через хук
 * хоста (оптимистичная мутация, reply, threadRootId, идемпотентность — не
 * дублируются). Хосты (conversation-pane, thread-pane, thread-feed)
 * регистрируют свою отправку по scope черновика на всё время монтирования
 * панели (режим выделения не в счёт: композер размонтируется, панель живёт).
 * Возврат — Promise мутации: окно держит «Отправить» нажатой до исхода и
 * переживает сетевую ошибку с повтором (текст и файлы не теряются, #123).
 */
const submits = new Map<string, (submit: ComposerSubmit) => Promise<unknown>>();

export function registerScopeSubmit(
  scope: string,
  submit: (submit: ComposerSubmit) => Promise<unknown>,
): () => void {
  submits.set(scope, submit);
  return () => {
    if (submits.get(scope) === submit) submits.delete(scope);
  };
}

/** null — хост скоупа не смонтирован (отправка невозможна). */
export function submitForScope(scope: string, submit: ComposerSubmit): Promise<unknown> | null {
  return submits.get(scope)?.(submit) ?? null;
}
