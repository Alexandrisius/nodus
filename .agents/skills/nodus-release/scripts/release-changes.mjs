#!/usr/bin/env node
// Сбор изменений к выпуску (навык nodus-release, #386): squash-коммиты main
// от последнего выкаченного тега до цели, разбор conventional-заголовков,
// раскладка на «кандидаты в окно "Что нового"» / «проверить» / «техника»,
// предложение следующей версии. С --details подтягивает тело PR через gh
// (агент читает суть изменений, а не только заголовок).
//
//   node .agents/skills/nodus-release/scripts/release-changes.mjs
//        [--from <ref>] [--to <ref>] [--details | --changelog]
//
// --details:   тела PR и метки issue у кандидатов (для написания текстов).
// --changelog: markdown технического changelog для `gh release create -F -`.
// --from: по умолчанию последний тег v*.*.* (выкаченный на прод выпуск);
//         тегов ещё нет — обязателен (коммит, из которого собран прод).
// --to:   по умолчанию origin/main (перед запуском — git fetch).

import { execFileSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Предыдущий выпуск: ближайший тег v* от цели. Цель передана явно и сама
// помечена тегом (`--to v0.2.0` для changelog) — ищем от её родителя, иначе
// диапазон v0.2.0..v0.2.0 пуст.
function lastReleaseTag() {
  const describe = (ref) =>
    run('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', ref]);
  try {
    const target = typeof args.to === 'string' ? args.to : 'origin/main';
    const tag = describe(target);
    const sameCommit = run('git', ['rev-parse', `${tag}^{commit}`]) === run('git', ['rev-parse', `${target}^{commit}`]);
    return typeof args.to === 'string' && sameCommit ? describe(`${target}^`) : tag;
  } catch {
    return null;
  }
}

const to = typeof args.to === 'string' ? args.to : 'origin/main';
const from = typeof args.from === 'string' ? args.from : lastReleaseTag();
if (!from) {
  console.error('Тегов v*.*.* нет: укажите --from <коммит, из которого собран текущий прод>.');
  process.exit(1);
}

// Технические типы — в окно пользователям обычно не идут (только в GitHub Release).
const TECH = new Set(['chore', 'docs', 'test', 'ci', 'build', 'refactor', 'style']);
// Технический тип, но скоуп продуктового модуля: может быть заметен (скорость, поведение).
const PRODUCT_SCOPES = /^(tasks|chat|home|auth|projects|letters|correspondence|crm|directory|employees|notifications|files|web)$/;
// Скоупы разработки — техника при любом типе (fix(ci), chore(deps), feat(dev)…).
const TECH_SCOPES = /^(ci|deps|deps-dev|test|e2e|lint|agents|skills|dev|runbook|docs|release)$/;

const SEP = '\u001f';
const log = run('git', ['log', '--first-parent', `--format=%H${SEP}%cs${SEP}%s`, `${from}..${to}`]);
const commits = log
  ? log.split('\n').map((line) => {
      const [sha, date, subject] = line.split(SEP);
      const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject);
      const refs = [...subject.matchAll(/\(#(\d+)\)/g)].map((r) => Number(r[1]));
      const type = m?.[1] ?? 'other';
      const scopes = m?.[2]?.split(',').map((s) => s.trim()) ?? [];
      let bucket = 'tech';
      if (type === 'feat' || type === 'fix' || type === 'perf' || m?.[3]) bucket = 'user';
      else if (!TECH.has(type) || scopes.some((s) => PRODUCT_SCOPES.test(s))) bucket = 'check';
      if (scopes.some((s) => TECH_SCOPES.test(s))) bucket = 'tech';
      return {
        sha: sha.slice(0, 8),
        date,
        subject,
        type,
        bucket,
        pr: refs.length > 0 ? refs[refs.length - 1] : null,
        issue: refs.length > 1 ? refs[refs.length - 2] : null,
      };
    })
  : [];

// Метки живут на issue (тип/модуль/слой), не на PR — берём оттуда.
function issueLabels(issue) {
  if (!issue) return '';
  try {
    const json = JSON.parse(run('gh', ['issue', 'view', String(issue), '--json', 'labels']));
    return json.labels.map((l) => l.name).join(', ');
  } catch {
    return '';
  }
}

function prDetails(pr, issue) {
  try {
    const json = JSON.parse(run('gh', ['pr', 'view', String(pr), '--json', 'body']));
    const labels = issueLabels(issue);
    const body = json.body
      .split('\n')
      .filter((l) => l.trim() && !/^(Closes|Refs|Generated with|Co-Authored-By)/i.test(l.trim()))
      .slice(0, 30)
      .map((l) => `    ${l}`)
      .join('\n');
    return `    [метки: ${labels || '—'}]\n${body}`;
  } catch {
    return '    (тело PR недоступно)';
  }
}

const TITLES = {
  user: 'Кандидаты в окно «Что нового» (feat/fix/perf)',
  check: 'Проверить: технический тип в продуктовом модуле — заметно ли пользователю?',
  tech: 'Техника — только в технический changelog GitHub Release',
};

// --changelog: технический changelog для тела GitHub Release (markdown).
if (args.changelog) {
  const section = (title, list) =>
    list.length ? `### ${title}\n\n${list.map((c) => `- ${c.subject}`).join('\n')}\n` : '';
  const user = commits.filter((c) => c.bucket !== 'tech');
  const tech = commits.filter((c) => c.bucket === 'tech');
  console.log(
    [
      `Изменения \`${from}..${to}\` (${commits.length} коммитов). Пользовательские тексты — окно «Что нового» в портале.\n`,
      section('Продукт', user),
      section('Техническое', tech),
    ].join('\n'),
  );
  process.exit(0);
}

console.log(`Выпуск: ${from}..${to} — коммитов: ${commits.length}\n`);
for (const bucket of ['user', 'check', 'tech']) {
  const list = commits.filter((c) => c.bucket === bucket);
  if (list.length === 0) continue;
  console.log(`## ${TITLES[bucket]} (${list.length})\n`);
  for (const c of list) {
    const ref = c.pr ? ` PR #${c.pr}${c.issue ? `, issue #${c.issue}` : ''}` : '';
    console.log(`- ${c.date} ${c.sha} ${c.subject}${ref ? ` —${ref}` : ''}`);
    if (args.details && bucket !== 'tech' && c.pr) console.log(prDetails(c.pr, c.issue));
  }
  console.log('');
}

const prev = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(from);
if (prev) {
  const [maj, min, pat] = prev.slice(1).map(Number);
  const hasFeat = commits.some((c) => c.type === 'feat');
  console.log(`Следующая версия: v${hasFeat ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`} (${hasFeat ? 'есть feat → минор' : 'только фиксы → патч'})`);
} else {
  console.log('Следующая версия: первый выпуск — v0.1.0');
}
