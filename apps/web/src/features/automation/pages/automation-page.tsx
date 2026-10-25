import { useSearch } from '@tanstack/react-router';

import { FieldsTab } from '../components/fields/fields-tab.js';
import { ProcessesTab } from '../components/processes/processes-tab.js';

/**
 * Раздел «Автоматизация» (эпик #377): единый дом настройки.
 * Вкладки — в топбаре шелла (`nav-registry`): «Процессы» (библиотека типов
 * и редактор маршрутов) и «Атрибуты» (реестр кастомных полей, #431).
 * Модуль — окно-сплит (флаг `splitWindow` реестра навигации): ось контура
 * идёт до правого края рамы; «Атрибуты» под ней — журнал-таблица.
 * Глубокие ссылки: `/automation?type=<id>`, `/automation?tab=fields&field=<id>`.
 */
export function AutomationPage() {
  const search = useSearch({ strict: false }) as { tab?: string };
  return search.tab === 'fields' ? <FieldsTab /> : <ProcessesTab />;
}
