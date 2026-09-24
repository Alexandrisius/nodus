import { isDomainMocked } from '../api/api-mock-config.js';

/**
 * Гейт вложений чата (вердикт владельца 25.09, этап до #57): в живом режиме
 * (домен chat не мокается) файлового эндпоинта ещё нет — скрепка, вставка и
 * перетаскивание файлов ВЕЖЛИВО НЕДОСТУПНЫ с подсказкой
 * (ui.chat.attachmentsUnavailable), никаких тостов-ошибок. В мок-режиме
 * (демо) вложения работают как раньше. Хранилище (MinIO, Ф6 после #57)
 * снимет гейт — выключение одного здесь.
 */
export function chatAttachmentsEnabled(): boolean {
  return isDomainMocked('chat');
}
