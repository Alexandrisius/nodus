import { isDomainMocked } from './api-mock-config.js';

/** Модуль проектов пока живёт только на моках (бэкенд — #52): в живом
 *  режиме поля и фильтры «Проект» задач скрыты, чтобы не звать пустой API. */
export function projectsAvailable(): boolean {
  return isDomainMocked('projects');
}
