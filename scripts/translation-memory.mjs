#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'source', 'en');
const TRANSLATIONS = path.join(ROOT, 'translations');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const o = args(process.argv.slice(2));
const todoPath = path.resolve(o.todo || 'todo.json');
const outPath = path.resolve(o.out || 'todo.prefilled.json');
const remainingPath = path.resolve(o.remaining || 'todo.remaining.json');
const reportPath = path.resolve(o.report || 'translation-memory-report.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, '\t') + '\n');

function englishOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.en === 'string') return value.en;
    if (typeof value.message === 'string') return value.message;
  }
  return undefined;
}

function placeholders(value) {
  return [...String(value).matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join('|');
}

function cosmeticEnglish(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\`'‘’“”"]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function manifestExtensions() {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const map = new Map();
  for (const loc of pkg?.contributes?.localizations || []) {
    for (const t of loc.translations || []) {
      if (t.id !== 'vscode') map.set(t.id, t.path.replace(/^\.\//, ''));
    }
  }
  return map;
}

const memory = new Map();
let memoryPairs = 0;

function addMemory(en, he, where) {
  if (typeof en !== 'string' || typeof he !== 'string' || !en || !he) return;
  if (placeholders(en) !== placeholders(he)) return;

  let variants = memory.get(en);
  if (!variants) memory.set(en, (variants = new Map()));
  let record = variants.get(he);
  if (!record) variants.set(he, (record = { count: 0, examples: [] }));
  record.count++;
  memoryPairs++;
  if (record.examples.length < 3) record.examples.push(where);
}

const sourceCore = readJson(path.join(SOURCE, 'main.json'));
const translationCore = readJson(path.join(TRANSLATIONS, 'main.i18n.json')).contents || {};

for (const [moduleName, bucket] of Object.entries(sourceCore)) {
  const translated = translationCore[moduleName] || {};
  for (const [key, src] of Object.entries(bucket)) {
    if (typeof translated[key] === 'string') {
      addMemory(englishOf(src), translated[key], `core.${moduleName}.${key}`);
    }
  }
}

for (const [id, rel] of manifestExtensions()) {
  const sourcePath = path.join(SOURCE, 'extensions', `${id}.json`);
  const translationPath = path.join(ROOT, rel);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(translationPath)) continue;

  const src = readJson(sourcePath);
  const tr = readJson(translationPath).contents || {};
  for (const section of ['package', 'bundle']) {
    const srcBucket = src[section] || {};
    const trBucket = tr[section] || {};
    for (const [key, sourceValue] of Object.entries(srcBucket)) {
      if (typeof trBucket[key] === 'string') {
        addMemory(englishOf(sourceValue), trBucket[key], `extension.${id}.${section}.${key}`);
      }
    }
  }
}

function uniqueMemory(en) {
  const variants = memory.get(en);
  if (!variants || variants.size !== 1) return null;
  const [[he, meta]] = variants.entries();
  return { he, meta };
}

const todo = readJson(todoPath);
const prefilled = { vscode: todo.vscode, core: {}, extensions: {} };
const remaining = { vscode: todo.vscode, core: {}, extensions: {} };
const matches = [];
const ambiguous = [];

let total = 0;
let reused = 0;
let cosmeticCarriedForward = 0;

function routeItem(item, destinationSetter, location) {
  total++;
  const en = item?.en;
  if (typeof en !== 'string') {
    destinationSetter(remaining, item);
    return;
  }

  const variants = memory.get(en);
  const hit = uniqueMemory(en);
  if (hit && placeholders(en) === placeholders(hit.he)) {
    destinationSetter(prefilled, hit.he);
    reused++;
    matches.push({
      location,
      en,
      he: hit.he,
      priorUses: hit.meta.count,
      examples: hit.meta.examples,
      reason: 'exact-translation-memory',
    });
    return;
  }

  if (
    typeof item?.was === 'string' &&
    typeof item?.current === 'string' &&
    cosmeticEnglish(item.was) === cosmeticEnglish(en) &&
    placeholders(en) === placeholders(item.current)
  ) {
    destinationSetter(prefilled, item.current);
    reused++;
    cosmeticCarriedForward++;
    matches.push({
      location,
      en,
      he: item.current,
      priorUses: 1,
      examples: [location],
      reason: 'cosmetic-source-change',
    });
    return;
  }

  if (variants && variants.size > 1) {
    ambiguous.push({
      location,
      en,
      variants: [...variants.entries()].map(([he, meta]) => ({
        he,
        priorUses: meta.count,
        examples: meta.examples,
      })),
    });
  }
  destinationSetter(remaining, item);
}

for (const [moduleName, bucket] of Object.entries(todo.core || {})) {
  for (const [key, item] of Object.entries(bucket || {})) {
    routeItem(
      item,
      (dest, value) => ((dest.core[moduleName] ||= {})[key] = value),
      `core.${moduleName}.${key}`,
    );
  }
}

for (const [id, ext] of Object.entries(todo.extensions || {})) {
  for (const [section, bucket] of Object.entries(ext || {})) {
    for (const [key, item] of Object.entries(bucket || {})) {
      routeItem(
        item,
        (dest, value) => ((((dest.extensions[id] ||= {})[section] ||= {})[key] = value)),
        `extension.${id}.${section}.${key}`,
      );
    }
  }
}

function prune(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  for (const key of Object.keys(obj)) {
    const value = prune(obj[key]);
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete obj[key];
    }
  }
  return obj;
}

prune(prefilled);
prune(remaining);

const report = {
  vscode: todo.vscode,
  translationMemoryPairs: memoryPairs,
  distinctEnglishStrings: memory.size,
  todoItems: total,
  reusedTotal: reused,
  exactUniqueReused: reused - cosmeticCarriedForward,
  cosmeticCarriedForward,
  remaining: total - reused,
  reuseRate: total ? Number(((reused / total) * 100).toFixed(2)) : 0,
  ambiguousEnglishStringsEncountered: ambiguous.length,
  matches,
  ambiguous,
};

writeJson(outPath, prefilled);
writeJson(remainingPath, remaining);
writeJson(reportPath, report);

console.log(`Translation-memory pairs indexed: ${memoryPairs}`);
console.log(`Distinct English source strings indexed: ${memory.size}`);
console.log(`Todo items: ${total}`);
console.log(`Exact unique matches reused: ${reused - cosmeticCarriedForward}`);
console.log(`Cosmetic source changes safely carried forward: ${cosmeticCarriedForward}`);
console.log(`Total reused: ${reused}`);
console.log(`Remaining for translation/review: ${total - reused}`);
console.log(`Reuse rate: ${report.reuseRate}%`);
console.log(`Ambiguous exact-source matches left unresolved: ${ambiguous.length}`);
