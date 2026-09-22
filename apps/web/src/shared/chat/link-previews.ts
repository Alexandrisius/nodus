import type { ComponentType } from 'react';

/** Точка расширения (I13): реестр превью ссылок на сущности в чате.
 *  shared/chat парсит ссылки (entity-links.ts) и рендерит превью, но НЕ знает
 *  сущностей и навигации — фичи регистрируют компоненты своих видов
 *  («letter» — корреспонденция). Регистрация — побочный эффект модуля фичи,
 *  загружаемого на старте (letter-card — eager-импорт стека). */
export interface LinkPreviewProps {
  id: string;
}

const registry = new Map<string, ComponentType<LinkPreviewProps>>();

export function registerLinkPreview(
  kind: string,
  component: ComponentType<LinkPreviewProps>,
): void {
  registry.set(kind, component);
}

export function linkPreviewFor(kind: string): ComponentType<LinkPreviewProps> | undefined {
  return registry.get(kind);
}
