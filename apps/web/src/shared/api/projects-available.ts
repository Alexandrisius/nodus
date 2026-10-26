import { isDomainMocked } from './api-mock-config.js';

/** Привязка к проекту работает, только когда сущность и проекты живут в
 *  ОДНОМ мире: проекты пока есть лишь в моках (бэкенд — #52), поэтому живая
 *  задача или письмо с мок-проектом получили бы 404 на projectId. Вне общего
 *  мок-режима поля, колонки и фильтры «Проект» скрыты. После #52 — живая
 *  проверка флага модуля проектов. */
export function projectsAvailable(world: 'tasks' | 'letters' = 'tasks'): boolean {
  return isDomainMocked('projects') && isDomainMocked(world);
}
