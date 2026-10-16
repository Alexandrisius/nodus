import { isDomainMocked } from './api-mock-config.js';

/** Привязка задачи к проекту работает, только когда задачи и проекты живут
 *  в ОДНОМ мире: проекты пока есть лишь в моках (бэкенд — #52), поэтому
 *  живые задачи с мок-проектом получили бы 404 на projectId. Вне общего
 *  мок-режима поля и фильтры «Проект» задач скрыты. После #52 — живая
 *  проверка флага модуля проектов. */
export function projectsAvailable(): boolean {
  return isDomainMocked('projects') && isDomainMocked('tasks');
}
