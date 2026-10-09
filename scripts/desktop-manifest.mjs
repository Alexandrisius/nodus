#!/usr/bin/env node
// Генератор артефактов раздачи оболочки (#263): latest.json для
// tauri-plugin-updater и changelog.json для попапа «Скачать приложение».
// Вызывается после `tauri build` (локально и в CI — .github/workflows/desktop.yml).
//
//   node scripts/desktop-manifest.mjs [--bundle-dir <dir>] [--out <file>]
//        [--notes <text>] [--optional]
//   node scripts/desktop-manifest.mjs --changelog <releases.json> [--changelog-out <file>]
//
// latest.json: подписи — СОДЕРЖИМОЕ .sig-файлов; URL — относительные
// (/desktop/<имя>): nginx web-контейнера абсолютизирует их на раздаче
// (sub_filter, infra/nginx/web.conf), поэтому один манифест работает на любом
// домене коробки. Target-ключи: windows-x86_64-nsis / -msi — апдейтер ищет
// ключ по типу ТЕКУЩЕЙ установки, каналы обновления не пересекаются.
// `--optional`: без .sig (CI без секрета подписи) — предупредить и выйти (0).
//
// changelog.json: из `gh release list --json tagName,publishedAt,body`
// (фильтр desktop-v*), newest-first, для попапа кнопки скачивания.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));

if (args.changelog) {
  writeChangelog(args.changelog, args.changelogOut);
} else {
  writeManifest(args);
}

function parseArgs(argv) {
  // Флаги без значения (--optional) — true, а не «съесть следующий аргумент»
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]?.replace(/^--/, '')?.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!key) continue;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  console.error(`desktop-manifest: ${message}`);
  process.exit(1);
}

function writeManifest({ bundleDir, out, notes, optional }) {
  const bundle = resolve(repoRoot, bundleDir ?? 'apps/desktop/src-tauri/target/release/bundle');
  const tauriConf = JSON.parse(
    readFileSync(resolve(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  );
  const version = tauriConf.version;

  // Файлы именно СВОЕЙ версии: в bundle-каталоге остаются артефакты
  // прошлых сборок — паттерн без версии взял бы устаревший установщик.
  const nsisExe = pickFile(
    resolve(bundle, 'nsis'),
    new RegExp(`^Nodus_${escapeRe(version)}_x64-setup\\.exe$`),
  );
  const msi = pickFile(
    resolve(bundle, 'msi'),
    new RegExp(`^Nodus_${escapeRe(version)}_x64.*\\.msi$`),
  );
  const missing = [nsisExe, msi].filter((f) => !f);
  if (missing.length > 0) fail(`в ${bundle} нет установщиков (nsis/msi) — сборка не выполнялась?`);
  if (!existsSync(`${nsisExe}.sig`)) {
    if (optional) {
      console.warn(
        `desktop-manifest: нет ${nsisExe}.sig — сборка без ключа подписи, latest.json не пишется`,
      );
      return;
    }
    fail(`нет ${nsisExe}.sig — собирайте с TAURI_SIGNING_PRIVATE_KEY (createUpdaterArtifacts)`);
  }

  const platforms = {
    'windows-x86_64-nsis': platformEntry(nsisExe),
    // MSI-канал только если подпись есть (GPO-раскатка); fallback-ключ = NSIS
    ...(existsSync(`${msi}.sig`) ? { 'windows-x86_64-msi': platformEntry(msi) } : {}),
    'windows-x86_64': platformEntry(nsisExe),
  };
  const manifest = {
    version,
    notes: notes ?? `Nodus ${version}`,
    pub_date: new Date().toISOString(),
    platforms,
  };
  // Явный --out — путь от корня репо (CI: dist/latest.json); дефолт — рядом
  // с установщиками в bundle-каталоге.
  const target = out ? resolve(repoRoot, out) : resolve(bundle, 'latest.json');
  // Минифицированно: nginx sub_filter матчит '"url":"/desktop/' как есть
  writeFileSync(target, `${JSON.stringify(manifest)}\n`);
  console.log(`desktop-manifest: ${target} (версия ${version})`);
}

function platformEntry(installerPath) {
  const base = installerPath.split(/[\\/]/).pop();
  return {
    signature: readFileSync(`${installerPath}.sig`, 'utf8').trim(),
    url: `/desktop/${base}`,
  };
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickFile(dir, pattern) {
  if (!existsSync(dir)) return null;
  const match = readdirSync(dir).find((name) => pattern.test(name));
  return match ? resolve(dir, match) : null;
}

function writeChangelog(releasesPath, changelogOut) {
  const releases = JSON.parse(readFileSync(resolve(repoRoot, releasesPath), 'utf8'));
  const entries = releases
    .filter((r) => /^desktop-v/.test(r.tagName))
    .map((r) => ({
      version: r.tagName.replace(/^desktop-v/, ''),
      date: r.publishedAt,
      notes: (r.body ?? '').trim() || `Nodus ${r.tagName.replace(/^desktop-v/, '')}`,
    }));
  const target = changelogOut
    ? resolve(repoRoot, changelogOut)
    : resolve(repoRoot, 'changelog.json');
  writeFileSync(target, `${JSON.stringify(entries)}\n`);
  console.log(`desktop-manifest: ${target} (${entries.length} релизов)`);
}
