import { nodusConfig } from '@nodus/config/eslint';

// Конфиг фикстур идентичен корневому (паттерны boundaries cwd-относительны),
// только без ignores — сами фикстуры и есть объект проверки.
export default [...nodusConfig];
