#!/usr/bin/env node
// כלי סנכרון מחרוזות המקור של VS Code עבור חבילת השפה העברית.
//
//   extract  בניית תמונת מצב של מחרוזות המקור באנגלית מגרסת VS Code מותקנת
//   status   בדיקת כיסוי: מה מתורגם מול תמונת המצב הנוכחית
//   diff     השוואת תמונת מצב חדשה לבסיס, והפקת רשימת המחרוזות לתרגום
//   apply    מיזוג תרגומים חזרה, מחיקת מפתחות מיושנים וקידום הבסיס
//
// מחרוזות הליבה ומקטע package של ההרחבות נקראים מהתקנה מקומית של VS Code.
// מקטע bundle אינו נשלח בהתקנה — הוא נגזר מ-vscode-loc, שבו המפתחות עצמם
// הם מחרוזות המקור באנגלית (כך עובד vscode.l10n.t).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'source', 'en');
const DEFAULT_APP = '/Applications/Visual Studio Code.app';
const LOC_RAW = 'https://raw.githubusercontent.com/microsoft/vscode-loc/main/i18n';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, '\t') + '\n');
};
const die = (msg) => { console.error('שגיאה: ' + msg); process.exit(1); };

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
    else o._.push(argv[i]);
  }
  return o;
}

// מזהי ההרחבות שהמניפסט שלנו מתרגם, וגם הנתיב לקובץ התרגום
function manifestExtensions() {
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const map = new Map();
  for (const loc of pkg.contributes.localizations)
    for (const t of loc.translations)
      if (t.id !== 'vscode') map.set(t.id, t.path.replace(/^\.\//, ''));
  return map;
}

function appResources(app) {
  const candidates = [
    app,
    path.join(app, 'Contents', 'Resources', 'app'),
    path.join(app, 'resources', 'app'),
    path.join(app, 'Resources', 'app'),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'package.json')) &&
      fs.existsSync(path.join(candidate, 'out')) &&
      fs.existsSync(path.join(candidate, 'extensions'))
    ) {
      return candidate;
    }
  }

  die(`לא נמצאו משאבי VS Code תחת ${app}. אפשר להעביר --app שמצביע ישירות לתיקיית resources/app.`);
}

// ---------------------------------------------------------------- extract

async function extract(o) {
  const app = o.app || DEFAULT_APP;
  const out = o.out || path.join(ROOT, 'source', 'en.new');
  const refLang = o['ref-lang'] || 'ru';
  const res = appResources(app);
  if (!fs.existsSync(res)) die(`לא נמצאה התקנת VS Code ב-${app}`);

  const version = readJson(path.join(res, 'package.json')).version;
  console.log(`גרסת VS Code: ${version}`);

  // ליבה
  const meta = readJson(path.join(res, 'out', 'nls.metadata.json'));
  const core = {};
  let coreCount = 0, dupes = 0;
  for (const mod of Object.keys(meta.keys)) {
    const keys = meta.keys[mod].map((k) => (typeof k === 'string' ? k : k.key));
    const comments = meta.keys[mod].map((k) => (typeof k === 'string' ? null : k.comment || null));
    const msgs = meta.messages[mod];
    const bucket = (core[mod] = {});
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] in bucket) {
        if (bucket[keys[i]].en !== msgs[i])
          console.warn(`  אזהרה: מפתח כפול עם טקסט שונה — ${mod} :: ${keys[i]}`);
        dupes++;
        continue;
      }
      bucket[keys[i]] = comments[i] ? { en: msgs[i], comment: comments[i] } : { en: msgs[i] };
      coreCount++;
    }
  }
  console.log(`ליבה: ${Object.keys(core).length} מודולים, ${coreCount} מחרוזות (${dupes} כפילויות מוזגו)`);

  // הרחבות: מקטע package מההתקנה
  const extDir = path.join(res, 'extensions');
  const exts = {};
  for (const d of fs.readdirSync(extDir)) {
    const pj = path.join(extDir, d, 'package.json');
    const nls = path.join(extDir, d, 'package.nls.json');
    if (!fs.existsSync(pj) || !fs.existsSync(nls)) continue;
    const p = readJson(pj);
    const id = `${p.publisher || 'vscode'}.${p.name}`;
    const keys = readJson(nls);
    delete keys[''];
    exts[id] = { package: keys, bundle: {} };
  }
  console.log(`הרחבות: ${Object.keys(exts).length} עם package.nls.json`);

  // הרחבות: מקטע bundle מ-vscode-loc
  const wanted = new Set([...manifestExtensions().keys(), ...Object.keys(exts)]);
  let withBundle = 0, bundleCount = 0, absent = [];
  for (const id of [...wanted].sort()) {
    const url = `${LOC_RAW}/vscode-language-pack-${refLang}/translations/extensions/${id}.i18n.json`;
    let r;
    try { r = await fetch(url); } catch (e) { die(`כשל רשת בהורדת ${id}: ${e.message}`); }
    if (!r.ok) { absent.push(id); continue; }
    const b = (await r.json()).contents?.bundle || {};
    // המפתח הוא מחרוזת המקור — הערך בשפת הייחוס נזרק
    const en = {};
    for (const k of Object.keys(b)) en[k] = { en: k };
    if (!Object.keys(en).length) continue;
    exts[id] ||= { package: {}, bundle: {} };
    exts[id].bundle = en;
    withBundle++;
    bundleCount += Object.keys(en).length;
  }
  console.log(`bundle: ${withBundle} הרחבות, ${bundleCount} מחרוזות (שפת ייחוס: ${refLang})`);
  if (absent.length) console.log(`  אין ב-vscode-loc (חדשות או ללא bundle): ${absent.length} — ${absent.slice(0, 6).join(', ')}`);

  fs.rmSync(out, { recursive: true, force: true });
  writeJson(path.join(out, 'main.json'), core);
  for (const [id, v] of Object.entries(exts)) writeJson(path.join(out, 'extensions', `${id}.json`), v);
  writeJson(path.join(out, 'meta.json'), {
    vscode: version,
    refLang,
    extractedAt: new Date().toISOString().slice(0, 10),
    counts: { modules: Object.keys(core).length, core: coreCount, extensions: Object.keys(exts).length, bundle: bundleCount },
  });
  console.log(`\nנכתב ל-${path.relative(ROOT, out)}`);
}

// ------------------------------------------------------------------ load

function loadSnapshot(dir) {
  if (!fs.existsSync(path.join(dir, 'main.json'))) die(`אין תמונת מצב ב-${dir} — הרץ קודם extract`);
  const exts = {};
  const ed = path.join(dir, 'extensions');
  if (fs.existsSync(ed))
    for (const f of fs.readdirSync(ed)) exts[f.replace(/\.json$/, '')] = readJson(path.join(ed, f));
  return {
    meta: fs.existsSync(path.join(dir, 'meta.json')) ? readJson(path.join(dir, 'meta.json')) : {},
    core: readJson(path.join(dir, 'main.json')),
    exts,
  };
}

function loadTranslations() {
  const core = readJson(path.join(ROOT, 'translations', 'main.i18n.json')).contents;
  const exts = {};
  for (const [id, rel] of manifestExtensions()) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { console.warn(`  אזהרה: קובץ תרגום חסר — ${rel}`); continue; }
    const c = readJson(p).contents || {};
    exts[id] = { package: c.package || {}, bundle: c.bundle || {} };
  }
  return { core, exts };
}

// ----------------------------------------------------------------- status

function status(o) {
  const src = loadSnapshot(o.src || BASE);
  const tr = loadTranslations();
  let missing = 0, stale = 0;
  const rows = [];

  for (const mod of Object.keys(src.core)) {
    const have = tr.core[mod] || {};
    const m = Object.keys(src.core[mod]).filter((k) => !(k in have)).length;
    const s = Object.keys(have).filter((k) => !(k in src.core[mod])).length;
    if (m || s) rows.push([`ליבה/${mod}`, m, s]);
    missing += m; stale += s;
  }
  for (const mod of Object.keys(tr.core)) if (!src.core[mod]) { const n = Object.keys(tr.core[mod]).length; rows.push([`ליבה/${mod}`, 0, n]); stale += n; }

  for (const id of new Set([...Object.keys(src.exts), ...Object.keys(tr.exts)])) {
    const s = src.exts[id] || { package: {}, bundle: {} };
    const t = tr.exts[id] || { package: {}, bundle: {} };
    let m = 0, st = 0;
    for (const sec of ['package', 'bundle']) {
      m += Object.keys(s[sec]).filter((k) => !(k in t[sec])).length;
      st += Object.keys(t[sec]).filter((k) => !(k in s[sec])).length;
    }
    if (m || st) rows.push([id, m, st]);
    missing += m; stale += st;
  }

  console.log(`בסיס: VS Code ${src.meta.vscode || '?'} (נוצר ${src.meta.extractedAt || '?'})`);
  console.log(`מחרוזות לא מתורגמות: ${missing}`);
  console.log(`מפתחות מיושנים: ${stale}`);
  if (rows.length) {
    console.log('\nפערים:');
    for (const [n, m, s] of rows.slice(0, 40)) console.log(`  ${n}: חסרים ${m}, מיושנים ${s}`);
    if (rows.length > 40) console.log(`  ...ועוד ${rows.length - 40}`);
  } else console.log('\nאין פערים — התרגום מלא.');
  return missing + stale;
}

// ------------------------------------------------------------------- diff

function diff(o) {
  const from = loadSnapshot(o.from || BASE);
  const to = loadSnapshot(o.to || path.join(ROOT, 'source', 'en.new'));
  const tr = loadTranslations();
  const todo = { vscode: to.meta.vscode, core: {}, extensions: {} };
  let added = 0, changed = 0, removed = 0;

  for (const mod of Object.keys(to.core)) {
    const oldMod = from.core[mod] || {};
    const have = tr.core[mod] || {};
    for (const [k, v] of Object.entries(to.core[mod])) {
      const isNew = !(k in oldMod);
      const isChanged = !isNew && oldMod[k].en !== v.en;
      if (!isNew && !isChanged && k in have) continue;
      (todo.core[mod] ||= {})[k] = {
        en: v.en, ...(v.comment ? { comment: v.comment } : {}),
        ...(isChanged ? { was: oldMod[k].en, current: have[k] } : {}),
      };
      isNew ? added++ : changed++;
    }
  }
  for (const mod of Object.keys(from.core)) if (!to.core[mod]) removed += Object.keys(from.core[mod]).length;
  for (const mod of Object.keys(to.core)) removed += Object.keys(from.core[mod] || {}).filter((k) => !(k in to.core[mod])).length;

  for (const id of Object.keys(to.exts)) {
    const oldE = from.exts[id] || { package: {}, bundle: {} };
    const have = tr.exts[id] || { package: {}, bundle: {} };
    for (const sec of ['package', 'bundle']) {
      for (const [k, v] of Object.entries(to.exts[id][sec])) {
        const isNew = !(k in oldE[sec]);
        const isChanged = !isNew && oldE[sec][k].en !== v.en;
        if (!isNew && !isChanged && k in have[sec]) continue;
        ((todo.extensions[id] ||= {})[sec] ||= {})[k] = {
          en: v.en, ...(isChanged ? { was: oldE[sec][k].en, current: have[sec][k] } : {}),
        };
        isNew ? added++ : changed++;
      }
      removed += Object.keys(oldE[sec]).filter((k) => !(k in to.exts[id][sec])).length;
    }
  }

  console.log(`${from.meta.vscode || '?'}  ->  ${to.meta.vscode || '?'}`);
  console.log(`חדשות: ${added}`);
  console.log(`השתנה הנוסח באנגלית: ${changed}  (התרגום הקיים כנראה כבר לא מדויק)`);
  console.log(`נמחקו מהמקור: ${removed}`);
  if (o.json) { writeJson(path.resolve(o.json), todo); console.log(`\nרשימת התרגום נכתבה ל-${o.json} — ${added + changed} פריטים`); }
  else if (added + changed) console.log('\nהרץ שוב עם ‎--json todo.json כדי לקבל את המחרוזות עצמן.');
}

// ------------------------------------------------------------------ apply

function apply(o) {
  const to = loadSnapshot(o.to || path.join(ROOT, 'source', 'en.new'));
  const translated = o.translated ? readJson(path.resolve(o.translated)) : { core: {}, extensions: {} };
  let ins = 0, del = 0;

  // ליבה
  const mainPath = path.join(ROOT, 'translations', 'main.i18n.json');
  const main = readJson(mainPath);
  for (const mod of Object.keys(to.core)) {
    const bucket = (main.contents[mod] ||= {});
    for (const [k, v] of Object.entries(translated.core?.[mod] || {}))
      if (typeof v === 'string') { bucket[k] = v; ins++; }
    for (const k of Object.keys(bucket)) if (!(k in to.core[mod])) { delete bucket[k]; del++; }
  }
  for (const mod of Object.keys(main.contents)) if (!to.core[mod]) { del += Object.keys(main.contents[mod]).length; delete main.contents[mod]; }
  writeJson(mainPath, main);

  // הרחבות
  for (const [id, rel] of manifestExtensions()) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p) || !to.exts[id]) continue;
    const j = readJson(p);
    j.contents ||= {};
    for (const sec of ['package', 'bundle']) {
      const src = to.exts[id][sec];
      if (!Object.keys(src).length) { if (j.contents[sec] && !Object.keys(j.contents[sec]).length) delete j.contents[sec]; continue; }
      const bucket = (j.contents[sec] ||= {});
      for (const [k, v] of Object.entries(translated.extensions?.[id]?.[sec] || {}))
        if (typeof v === 'string') { bucket[k] = v; ins++; }
      for (const k of Object.keys(bucket)) if (!(k in src)) { delete bucket[k]; del++; }
    }
    writeJson(p, j);
  }

  console.log(`הוכנסו ${ins} תרגומים, נמחקו ${del} מפתחות מיושנים.`);

  if (o['bump'] !== false && to.meta.vscode) {
    const pp = path.join(ROOT, 'package.json');
    const pkg = readJson(pp);
    pkg.version = to.meta.vscode;
    // engines.vscode נשאר במכוון ^1.0.0 — לא לקשור את החבילה לגרסה מינימלית
    writeJson(pp, pkg);
    console.log(`package.json עודכן לגרסה ${to.meta.vscode}.`);
  }

  const toDir = o.to || path.join(ROOT, 'source', 'en.new');
  if (path.resolve(toDir) !== path.resolve(BASE)) {
    fs.rmSync(BASE, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(BASE), { recursive: true });
    fs.renameSync(path.resolve(toDir), BASE);
    console.log(`הבסיס קודם ל-${path.relative(ROOT, BASE)}.`);
  }
}

// ------------------------------------------------------------------- main

const o = args(process.argv.slice(2));
const cmd = o._[0];
if (cmd === 'extract') await extract(o);
else if (cmd === 'status') process.exit(status(o) ? 1 : 0);
else if (cmd === 'diff') diff(o);
else if (cmd === 'apply') apply(o);
else {
  console.log(`שימוש: node scripts/vsloc.mjs <פקודה>

  extract  --app <נתיב ל-VS Code.app>  --out <תיקייה>  [--ref-lang ru]
           בונה תמונת מצב של מחרוזות המקור באנגלית מהתקנה מותקנת.

  status   [--src source/en]
           מה מתורגם ומה לא, מול הבסיס הנוכחי.

  diff     --from source/en  --to source/en.new  [--json todo.json]
           מה נוסף, מה השתנה ומה נמחק בין שתי תמונות מצב.

  apply    --to source/en.new  [--translated todo.he.json]
           ממזג תרגומים, מוחק מפתחות מיושנים, מעדכן גרסה ומקדם את הבסיס.`);
}
