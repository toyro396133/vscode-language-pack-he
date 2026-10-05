#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const o = args(process.argv.slice(2));
const todoPath = path.resolve(o.todo || 'todo.json');
const prefilledPath = path.resolve(o.prefilled || 'todo.prefilled.json');
const workDir = path.resolve(o.workdir || 'translation-work/v1.140');
const manualOut = path.resolve(o['manual-out'] || 'todo.manual.json');
const mergedOut = path.resolve(o['merged-out'] || 'todo.he.partial.json');
const remainingOut = path.resolve(o['remaining-out'] || 'todo.after-manual.json');
const reportOut = path.resolve(o.report || 'translation-batch-report.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, '\t') + '\n');

const todo = readJson(todoPath);
const prefilled = fs.existsSync(prefilledPath)
  ? readJson(prefilledPath)
  : { vscode: todo.vscode, core: {}, extensions: {} };

const index = new Map();

for (const [moduleName, bucket] of Object.entries(todo.core || {})) {
  for (const [key, item] of Object.entries(bucket || {})) {
    index.set(`core/${moduleName}/${key}`, { kind: 'core', moduleName, key, item });
  }
}

for (const [id, sections] of Object.entries(todo.extensions || {})) {
  for (const [section, bucket] of Object.entries(sections || {})) {
    for (const [key, item] of Object.entries(bucket || {})) {
      index.set(`extensions/${id}/${section}/${key}`, { kind: 'extension', id, section, key, item });
    }
  }
}

const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/u;
const PH = /\{\d+\}/g;
const placeholders = (s) => [...String(s).matchAll(PH)].map((m) => m[0]).sort();

function sameArray(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function setOverlay(dest, ref, value) {
  if (ref.kind === 'core') {
    ((dest.core[ref.moduleName] ||= {})[ref.key] = value);
  } else {
    ((((dest.extensions[ref.id] ||= {})[ref.section] ||= {})[ref.key] = value));
  }
}

function getOverlay(src, ref) {
  if (ref.kind === 'core') return src.core?.[ref.moduleName]?.[ref.key];
  return src.extensions?.[ref.id]?.[ref.section]?.[ref.key];
}

const manual = { vscode: todo.vscode, core: {}, extensions: {} };
const errors = [];
const warnings = [];
const seen = new Map();
const files = fs.existsSync(workDir)
  ? fs.readdirSync(workDir).filter((f) => f.endsWith('.json')).sort()
  : [];

let manualCount = 0;

for (const file of files) {
  const full = path.join(workDir, file);
  const doc = readJson(full);

  for (const [i, entry] of (doc.entries || []).entries()) {
    const where = `${file}#${i + 1}`;

    if (!entry?.path || typeof entry?.en !== 'string' || typeof entry?.he !== 'string') {
      errors.push(`${where}: each entry must contain path, en and he strings`);
      continue;
    }

    if (seen.has(entry.path)) {
      errors.push(`${where}: duplicate path already translated in ${seen.get(entry.path)}: ${entry.path}`);
      continue;
    }
    seen.set(entry.path, where);

    const ref = index.get(entry.path);
    if (!ref) {
      errors.push(`${where}: path does not exist in VS Code ${todo.vscode} delta: ${entry.path}`);
      continue;
    }

    if (entry.en !== ref.item.en) {
      errors.push(`${where}: English source mismatch for ${entry.path}`);
      continue;
    }

    if (!entry.he.trim()) {
      errors.push(`${where}: empty Hebrew translation for ${entry.path}`);
      continue;
    }

    if (BIDI.test(entry.he)) errors.push(`${where}: forbidden BiDi control character in ${entry.path}`);
    if (ZERO_WIDTH.test(entry.he)) warnings.push(`${where}: zero-width character in ${entry.path}`);

    const expected = placeholders(entry.en);
    const actual = placeholders(entry.he);
    if (!sameArray(expected, actual)) {
      errors.push(`${where}: placeholder mismatch for ${entry.path}; source=${JSON.stringify(expected)} translation=${JSON.stringify(actual)}`);
      continue;
    }

    setOverlay(manual, ref, entry.he);
    manualCount++;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ||= {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const merged = deepMerge(
  deepMerge({ vscode: todo.vscode, core: {}, extensions: {} }, clone(prefilled)),
  clone(manual),
);
const remaining = { vscode: todo.vscode, core: {}, extensions: {} };

let covered = 0;
let remainingCount = 0;
let changedCovered = 0;
let changedTotal = 0;
let newCovered = 0;
let newTotal = 0;

for (const ref of index.values()) {
  const isChanged = typeof ref.item?.was === 'string';
  if (isChanged) changedTotal++;
  else newTotal++;

  const translated = getOverlay(merged, ref);
  if (typeof translated === 'string') {
    covered++;
    if (isChanged) changedCovered++;
    else newCovered++;
    continue;
  }

  remainingCount++;
  if (ref.kind === 'core') {
    ((remaining.core[ref.moduleName] ||= {})[ref.key] = ref.item);
  } else {
    ((((remaining.extensions[ref.id] ||= {})[ref.section] ||= {})[ref.key] = ref.item));
  }
}

function prune(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  for (const key of Object.keys(obj)) {
    prune(obj[key]);
    if (
      obj[key] &&
      typeof obj[key] === 'object' &&
      !Array.isArray(obj[key]) &&
      Object.keys(obj[key]).length === 0
    ) {
      delete obj[key];
    }
  }
  return obj;
}

prune(manual);
prune(merged);
prune(remaining);

let prefilledCount = 0;
for (const ref of index.values()) {
  if (typeof getOverlay(prefilled, ref) === 'string') prefilledCount++;
}

const report = {
  vscode: todo.vscode,
  batchFiles: files,
  deltaItems: index.size,
  manualTranslations: manualCount,
  prefilledTranslations: prefilledCount,
  covered,
  remaining: remainingCount,
  changed: {
    covered: changedCovered,
    total: changedTotal,
    remaining: changedTotal - changedCovered,
  },
  new: {
    covered: newCovered,
    total: newTotal,
    remaining: newTotal - newCovered,
  },
  warnings,
  errors,
};

writeJson(manualOut, manual);
writeJson(mergedOut, merged);
writeJson(remainingOut, remaining);
writeJson(reportOut, report);

console.log(`Batch files: ${files.length}`);
console.log(`Manual translations compiled: ${manualCount}`);
console.log(`Prefilled translations: ${prefilledCount}`);
console.log(`Delta coverage: ${covered}/${index.size}`);
console.log(`Changed strings covered: ${changedCovered}/${changedTotal}`);
console.log(`New strings covered: ${newCovered}/${newTotal}`);
console.log(`Remaining: ${remainingCount}`);

if (warnings.length) console.log(`Warnings: ${warnings.length}`);
if (errors.length) {
  console.error(`Errors: ${errors.length}`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
