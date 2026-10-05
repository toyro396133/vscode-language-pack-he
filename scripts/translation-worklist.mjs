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
const input = path.resolve(o.input || 'todo.remaining.json');
const output = path.resolve(o.out || 'translation-worklist.json');
const todo = JSON.parse(fs.readFileSync(input, 'utf8'));

const groups = new Map();

function add(kind, container, key, item) {
  if (!item || typeof item.en !== 'string') return;
  const location = kind === 'core'
    ? `core/${container}/${key}`
    : `extensions/${container}/${key}`;

  let group = groups.get(item.en);
  if (!group) {
    group = {
      en: item.en,
      changed: false,
      currentTranslations: [],
      previousEnglish: [],
      locations: [],
    };
    groups.set(item.en, group);
  }

  group.locations.push(location);
  if (typeof item.current === 'string') {
    group.changed = true;
    if (!group.currentTranslations.includes(item.current)) group.currentTranslations.push(item.current);
  }
  if (typeof item.was === 'string' && !group.previousEnglish.includes(item.was)) {
    group.previousEnglish.push(item.was);
  }
}

for (const [moduleName, bucket] of Object.entries(todo.core || {})) {
  for (const [key, item] of Object.entries(bucket || {})) add('core', moduleName, key, item);
}

for (const [id, sections] of Object.entries(todo.extensions || {})) {
  for (const [section, bucket] of Object.entries(sections || {})) {
    for (const [key, item] of Object.entries(bucket || {})) {
      add('extension', `${id}/${section}`, key, item);
    }
  }
}

function bucketFor(group) {
  if (group.changed) return 'changed';
  const len = group.en.length;
  if (len <= 50) return 'newShort';
  if (len <= 180) return 'newMedium';
  return 'newLong';
}

const worklist = {
  vscode: todo.vscode,
  counts: {
    locations: 0,
    uniqueEnglish: groups.size,
    duplicatesSaved: 0,
    changed: 0,
    newShort: 0,
    newMedium: 0,
    newLong: 0,
  },
  changed: [],
  newShort: [],
  newMedium: [],
  newLong: [],
};

for (const group of groups.values()) {
  const bucket = bucketFor(group);
  worklist[bucket].push(group);
  worklist.counts[bucket]++;
  worklist.counts.locations += group.locations.length;
}

worklist.counts.duplicatesSaved = worklist.counts.locations - worklist.counts.uniqueEnglish;

for (const bucket of ['changed', 'newShort', 'newMedium', 'newLong']) {
  worklist[bucket].sort((a, b) =>
    a.en.localeCompare(b.en, 'en') ||
    a.locations[0].localeCompare(b.locations[0], 'en')
  );
}

fs.writeFileSync(output, JSON.stringify(worklist, null, '\t') + '\n');

console.log(`Locations requiring translation/review: ${worklist.counts.locations}`);
console.log(`Unique English strings: ${worklist.counts.uniqueEnglish}`);
console.log(`Duplicate translation operations avoided: ${worklist.counts.duplicatesSaved}`);
console.log(`Changed strings: ${worklist.counts.changed}`);
console.log(`New short strings (<=50 chars): ${worklist.counts.newShort}`);
console.log(`New medium strings (51-180 chars): ${worklist.counts.newMedium}`);
console.log(`New long strings (>180 chars): ${worklist.counts.newLong}`);
