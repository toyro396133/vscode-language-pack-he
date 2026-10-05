#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const metaPath = path.join(ROOT, 'source', 'en', 'meta.json');
const sourceMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

function add(a, b) {
  return { total: a.total + b.total, hebrew: a.hebrew + b.hebrew };
}

function countStrings(value) {
  if (typeof value === 'string') {
    return { total: 1, hebrew: /\p{Script=Hebrew}/u.test(value) ? 1 : 0 };
  }
  if (Array.isArray(value)) {
    return value.reduce((acc, v) => add(acc, countStrings(v)), { total: 0, hebrew: 0 });
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((acc, v) => add(acc, countStrings(v)), { total: 0, hebrew: 0 });
  }
  return { total: 0, hebrew: 0 };
}

const localization = pkg?.contributes?.localizations?.[0] || {};
const rows = [];

for (const entry of localization.translations || []) {
  const file = path.resolve(ROOT, entry.path);
  if (!fs.existsSync(file)) continue;

  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const counts = countStrings(doc.contents || {});
  rows.push({
    id: entry.id,
    file: path.relative(ROOT, file).replaceAll('\\', '/'),
    strings: counts.total,
    stringsContainingHebrew: counts.hebrew,
  });
}

const core = rows.find((r) => r.id === 'vscode') || { strings: 0, stringsContainingHebrew: 0 };
const extensionRows = rows.filter((r) => r.id !== 'vscode');
const extensionStrings = extensionRows.reduce((n, r) => n + r.strings, 0);
const extensionHebrew = extensionRows.reduce((n, r) => n + r.stringsContainingHebrew, 0);

console.log(JSON.stringify({
  packageVersion: pkg.version,
  sourceVersion: sourceMeta.vscode || null,
  languageId: localization.languageId || null,
  localizationFiles: rows.length,
  coreStrings: core.strings,
  coreStringsContainingHebrew: core.stringsContainingHebrew,
  builtInExtensionFiles: extensionRows.length,
  builtInExtensionStrings: extensionStrings,
  builtInExtensionStringsContainingHebrew: extensionHebrew,
  totalStrings: core.strings + extensionStrings,
  totalStringsContainingHebrew: core.stringsContainingHebrew + extensionHebrew,
  perFile: rows,
}, null, 2));
