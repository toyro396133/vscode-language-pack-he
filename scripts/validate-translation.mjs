#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TRANSLATIONS = path.join(ROOT, 'translations');
const SOURCE = path.join(ROOT, 'source', 'en');
const MANIFEST = path.join(ROOT, 'package.json');

const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/u;
const REPLACEMENT_CHAR = /\uFFFD/u;
const NUMERIC_PLACEHOLDER = /\{\d+\}/g;

const errors = [];
const warnings = [];
const metrics = {
  files: 0,
  strings: 0,
  hebrewStrings: 0,
  placeholderPairsChecked: 0,
  missingKeys: 0,
  staleKeys: 0,
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rel = (file) => path.relative(ROOT, file).replaceAll('\\', '/');

function placeholders(value) {
  return [...String(value).matchAll(NUMERIC_PLACEHOLDER)].map((m) => m[0]).sort();
}

function sameArray(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sourceText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.en === 'string') return value.en;
  return null;
}

function scanString(value, location) {
  metrics.strings++;
  if (/\p{Script=Hebrew}/u.test(value)) metrics.hebrewStrings++;
  if (value.length === 0) errors.push(`${location}: empty translation`);
  if (BIDI_CONTROLS.test(value)) errors.push(`${location}: contains forbidden BiDi control character`);
  if (ZERO_WIDTH.test(value)) warnings.push(`${location}: contains zero-width character; verify it is intentional`);
  if (REPLACEMENT_CHAR.test(value)) errors.push(`${location}: contains Unicode replacement character U+FFFD`);
}

function scanTree(value, location) {
  if (typeof value === 'string') return scanString(value, location);
  if (Array.isArray(value)) return value.forEach((v, i) => scanTree(v, `${location}[${i}]`));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanTree(v, `${location}.${k}`);
  }
}

function compareBucket(sourceBucket, translatedBucket, location) {
  const src = sourceBucket && typeof sourceBucket === 'object' ? sourceBucket : {};
  const tr = translatedBucket && typeof translatedBucket === 'object' ? translatedBucket : {};

  for (const [key, srcValue] of Object.entries(src)) {
    if (!(key in tr)) {
      metrics.missingKeys++;
      errors.push(`${location}.${key}: missing translation`);
      continue;
    }
    if (typeof tr[key] !== 'string') {
      errors.push(`${location}.${key}: translation must be a string`);
      continue;
    }

    const en = sourceText(srcValue);
    if (en !== null) {
      metrics.placeholderPairsChecked++;
      const expected = placeholders(en);
      const actual = placeholders(tr[key]);
      if (!sameArray(expected, actual)) {
        errors.push(`${location}.${key}: placeholder mismatch; source=${JSON.stringify(expected)} translation=${JSON.stringify(actual)}`);
      }

      const sourceMnemonics = (en.match(/&&/g) || []).length;
      const translationMnemonics = (tr[key].match(/&&/g) || []).length;
      if (sourceMnemonics !== translationMnemonics) {
        warnings.push(`${location}.${key}: mnemonic marker count differs (${sourceMnemonics} -> ${translationMnemonics})`);
      }
    }
  }

  for (const key of Object.keys(tr)) {
    if (!(key in src)) {
      metrics.staleKeys++;
      errors.push(`${location}.${key}: stale translation key not present in source snapshot`);
    }
  }
}

function compareCore(sourceFile, translationFile) {
  const src = readJson(sourceFile);
  const trDoc = readJson(translationFile);
  const tr = trDoc.contents || {};

  for (const [moduleName, bucket] of Object.entries(src)) {
    compareBucket(bucket, tr[moduleName], `core.${moduleName}`);
  }
  for (const moduleName of Object.keys(tr)) {
    if (!(moduleName in src)) {
      metrics.staleKeys += Object.keys(tr[moduleName] || {}).length;
      errors.push(`core.${moduleName}: stale module not present in source snapshot`);
    }
  }
}

function compareExtension(sourceFile, translationFile, id) {
  const src = readJson(sourceFile);
  const trDoc = readJson(translationFile);
  const tr = trDoc.contents || {};

  for (const section of ['package', 'bundle']) {
    compareBucket(src[section], tr[section], `extension.${id}.${section}`);
  }
  for (const section of Object.keys(tr)) {
    if (!['package', 'bundle'].includes(section)) {
      warnings.push(`extension.${id}: unknown contents section ${section}`);
    }
  }
}

if (!fs.existsSync(MANIFEST)) {
  console.error('package.json not found. Run from the language-pack repository root.');
  process.exit(2);
}
if (!fs.existsSync(TRANSLATIONS)) {
  console.error('translations/ directory not found. Run from the language-pack repository root.');
  process.exit(2);
}
if (!fs.existsSync(SOURCE)) {
  console.error('source/en/ snapshot not found.');
  process.exit(2);
}

const pkg = readJson(MANIFEST);
const localizations = pkg?.contributes?.localizations;
if (!Array.isArray(localizations) || localizations.length !== 1) {
  errors.push('package.json: expected exactly one contributes.localizations entry');
}

const localization = localizations?.[0] || {};
if (localization.languageId !== 'he') {
  errors.push(`package.json: languageId must be "he", got ${JSON.stringify(localization.languageId)}`);
}
if (localization.languageName !== 'Hebrew') {
  warnings.push(`package.json: languageName is ${JSON.stringify(localization.languageName)}, expected "Hebrew"`);
}
if (localization.localizedLanguageName !== 'עברית') {
  warnings.push(`package.json: localizedLanguageName is ${JSON.stringify(localization.localizedLanguageName)}, expected "עברית"`);
}

const translations = localization.translations || [];
const seenIds = new Set();
const seenPaths = new Set();

for (const entry of translations) {
  if (!entry?.id || !entry?.path) {
    errors.push('package.json: localization translation entry must contain id and path');
    continue;
  }
  if (seenIds.has(entry.id)) errors.push(`package.json: duplicate translation id ${entry.id}`);
  if (seenPaths.has(entry.path)) errors.push(`package.json: duplicate translation path ${entry.path}`);
  seenIds.add(entry.id);
  seenPaths.add(entry.path);

  const translationFile = path.resolve(ROOT, entry.path);
  if (!fs.existsSync(translationFile)) {
    errors.push(`${entry.id}: manifest translation file is missing: ${entry.path}`);
    continue;
  }

  metrics.files++;
  let doc;
  try {
    doc = readJson(translationFile);
  } catch (err) {
    errors.push(`${rel(translationFile)}: invalid JSON: ${err.message}`);
    continue;
  }

  if (doc.version !== '1.0.0') {
    warnings.push(`${rel(translationFile)}: unexpected localization format version ${JSON.stringify(doc.version)}`);
  }
  if (!doc.contents || typeof doc.contents !== 'object' || Array.isArray(doc.contents)) {
    errors.push(`${rel(translationFile)}: missing object property "contents"`);
    continue;
  }

  scanTree(doc.contents, rel(translationFile));

  try {
    if (entry.id === 'vscode') {
      const sourceFile = path.join(SOURCE, 'main.json');
      if (!fs.existsSync(sourceFile)) errors.push('source/en/main.json is missing');
      else compareCore(sourceFile, translationFile);
    } else {
      const sourceFile = path.join(SOURCE, 'extensions', `${entry.id}.json`);
      if (!fs.existsSync(sourceFile)) {
        warnings.push(`${entry.id}: no source snapshot found at ${rel(sourceFile)}`);
      } else {
        compareExtension(sourceFile, translationFile, entry.id);
      }
    }
  } catch (err) {
    errors.push(`${entry.id}: source/translation comparison failed: ${err.message}`);
  }
}

console.log(`Validated ${metrics.files} localization files and ${metrics.strings} translated strings.`);
console.log(`Strings containing Hebrew characters: ${metrics.hebrewStrings}.`);
console.log(`Source/translation placeholder pairs checked: ${metrics.placeholderPairsChecked}.`);
console.log(`Missing keys: ${metrics.missingKeys}; stale keys: ${metrics.staleKeys}.`);

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings.slice(0, 100)) console.log(`  WARN  ${w}`);
  if (warnings.length > 100) console.log(`  ... ${warnings.length - 100} more warnings`);
}

if (errors.length) {
  console.error(`\nErrors (${errors.length}):`);
  for (const e of errors.slice(0, 100)) console.error(`  ERROR ${e}`);
  if (errors.length > 100) console.error(`  ... ${errors.length - 100} more errors`);
  process.exit(1);
}

console.log('\nTranslation validation passed.');
