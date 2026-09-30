// Дополняет public/emoji/emoji-data.json полем `t` — русским именем
// эмодзи (CLDR tts, ru). Пробел #130: генерация данных была разовой и не
// коммитилась; этот скрипт делает её воспроизводимой. Идемпотентен.
//
// Запуск: node apps/web/scripts/emoji-tts.mjs
// Источник — cldr-json 46.1.0 (та же линейка Unicode 16.0, что и данные):
//   cldr-annotations-full/annotations/ru + annotationsDerived/ru.
// `t` не участвует в поиске (это `s`/`n`) — только тултипы/подписи (I15).
import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../public/emoji/emoji-data.json', import.meta.url);
const CLDR_VERSION = '46.1.0';
const CLDR_FILES = [
  'cldr-json/cldr-annotations-full/annotations/ru/annotations.json',
  'cldr-json/cldr-annotations-derived-full/annotationsDerived/ru/annotations.json',
];

async function loadTts() {
  const tts = new Map();
  for (const path of CLDR_FILES) {
    const url = `https://raw.githubusercontent.com/unicode-org/cldr-json/${CLDR_VERSION}/${path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CLDR ${res.status}: ${url}`);
    const json = await res.json();
    const root = json.annotations ?? json.annotationsDerived;
    for (const [emoji, rec] of Object.entries(root.annotations)) {
      const name = rec.tts?.[0];
      if (name) tts.set(emoji, name);
    }
  }
  return tts;
}

/** Ключи CLDR — fully-qualified; наши `e` бывают и без VS16 — матчим вариантами. */
function sequenceVariants(emoji) {
  const fe0fAdded = emoji.replace(/\p{So}/gu, (ch) => ch + '\uFE0F');
  return [emoji, emoji.replace(/\uFE0F/g, ''), fe0fAdded, emoji + '\uFE0F'];
}

const data = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const tts = await loadTts();

let hit = 0;
const misses = [];
for (const group of data.groups) {
  for (const entry of group.emojis) {
    const name = sequenceVariants(entry.e)
      .map((v) => tts.get(v))
      .find(Boolean);
    if (name) {
      entry.t = name;
      hit += 1;
    } else {
      delete entry.t;
      misses.push(`${entry.e} ${entry.n}`);
    }
  }
}

await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`tts: ${hit}/${data.groups.reduce((n, g) => n + g.emojis.length, 0)}`);
if (misses.length > 0) console.log(`без русского имени (fallback на n):\n  ${misses.join('\n  ')}`);
