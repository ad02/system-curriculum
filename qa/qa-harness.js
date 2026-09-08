// QA harness for curriculum.html — run before handing the file over.
//   node qa/qa-harness.js
// Checks:
// 1. extracts the <script>, writes qa/extracted.js for `node --check`
// 2. runs it against a stub DOM, confirms #main renders non-empty
// 3. for EVERY module in CONTENT: audits every source line against md() output
//    -> any line whose text never appears in the rendered HTML is LOST (this
//       exact silent failure shipped once: 28 paragraphs missing, page looked fine)
// 4. renders every module (ready + outline) through render() looking for crashes
// 5. scans: em dashes, the \\" string-killer pattern, doctype, per-module counts

const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'curriculum.html');
const OUT = path.join(__dirname, 'extracted.js');

const src = fs.readFileSync(SRC, 'utf8');
const m = src.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('FATAL: no <script> block found'); process.exit(1); }
const js = m[1];
fs.writeFileSync(OUT, js);
console.log('extracted script:', js.length, 'chars');

let failures = 0;

// ---------- stub DOM ----------
const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', outerHTML: '', value: '', hidden: false, style: {}, files: [],
    classList: { toggle(){}, remove(){}, add(){}, contains(){ return false; } },
    addEventListener(){}, click(){}, querySelector(){ return mkEl('x'); }, setAttribute(){},
  };
}
global.document = {
  getElementById(id){ return store[id] || (store[id] = mkEl(id)); },
  querySelector(){ return mkEl('q'); },
  querySelectorAll(){ return []; },
  createElement(){ return mkEl('c'); },
};
global.window = { scrollTo(){} };
global.alert = () => {};

(0, eval)(js + '\n;globalThis.__exp = { md, CONTENT, TRACKS, ALL, allTasks, state, render, DIAGRAMS, CALCS, MATCHES, ORDERS, TERMINALS, hydrateWidgets, GLOSSARY };');
const { md, CONTENT, TRACKS, ALL, allTasks, state, render, DIAGRAMS, CALCS, MATCHES, ORDERS, TERMINALS, hydrateWidgets, GLOSSARY } = globalThis.__exp;

// ---------- render check ----------
const main = store['main'], nav = store['nav'];
console.log('\n=== RENDER CHECK ===');
console.log('#main innerHTML length:', main.innerHTML.length);
console.log('#nav  innerHTML length:', nav.innerHTML.length);
if (main.innerHTML.length < 1000 || nav.innerHTML.length < 1000) { console.log('FAIL: render too small'); failures++; }

let crashes = 0;
for (const mm of ALL) {
  try { state.cur = mm.c; render(); if (!main.innerHTML.includes(mm.t)) { console.log('MISSING TITLE:', mm.c); crashes++; } }
  catch (e) { console.log('RENDER CRASH on', mm.c, '->', e.message); crashes++; }
}
state.cur = 'A1'; render();
console.log('all', ALL.length, 'modules rendered,', crashes, 'problems');
failures += crashes;

// ---------- content-loss audit for every CONTENT module ----------
function fingerprint(line) {
  const runs = (line.match(/[A-Za-z][A-Za-z0-9 ,'.()/:;=_+\-]{11,}/g) || []).map(r => r.trim());
  runs.sort((a, b) => b.length - a.length);
  return runs[0];
}
console.log('\n=== CONTENT-LOSS AUDIT ===');
let totalLost = 0;
for (const [code, mod] of Object.entries(CONTENT)) {
  const sections = ['level0','level1','level2','level3','level4'].filter(k => mod[k]).map(k => [k, mod[k].body]);
  if (mod.repo) sections.push(['repo', mod.repo.body]);
  if (mod.exam) sections.push(['exam', mod.exam.body]);
  for (const [name, body] of sections) {
    const rawHtml = md(body);
    // remove glossary popover DEFINITION text, then strip tags, so auto-glossary + code/bold
    // don't break the contiguous-text matching the audit relies on
    const html = rawHtml.replace(/<span class="term-pop">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');
    let fence = false;
    const lost = [];
    body.split('\n').forEach((L, idx) => {
      if (L.startsWith('```')) { fence = !fence; return; }
      if (!L.trim()) return;
      if (/^\[\[(diagram|calc|match|order|terminal):[a-z0-9-]+\]\]$/.test(L)) return;  // widget token: becomes a placeholder div, not text
      const fp = fingerprint(L);
      if (!fp) return;
      if (!html.includes(fp)) lost.push({ n: idx + 1, src: L.slice(0, 80) });
    });
    if (lost.length) {
      console.log(`[${code}.${name}] ${lost.length} LOST:`);
      lost.forEach(x => console.log(`  line ${x.n}: ${x.src}`));
    }
    totalLost += lost.length;
    // HTML entities and raw tags do NOT work inside md() bodies (they get
    // double-escaped and show as literal text). Use plain quotes and backticks.
    for (const bad of ['&amp;quot;', '&lt;code&gt;', '&lt;strong&gt;', '&lt;br&gt;', '&amp;amp;']) {
      if (rawHtml.includes(bad)) {
        console.log(`[${code}.${name}] DOUBLE-ESCAPED ENTITY visible on page: ${bad}`);
        failures++;
      }
    }
  }
}
console.log('TOTAL LOST LINES:', totalLost);
failures += totalLost;

// ---------- task id uniqueness (ids come from task labels; labels must be unique per module) ----------
for (const code of Object.keys(CONTENT)) {
  const ids = allTasks(code).map(t => t.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) { console.log(`FAIL: duplicate task ids in ${code}:`, [...new Set(dupes)].join(', ')); failures++; }
}

// ---------- interactive: quiz answer fields ----------
console.log('\n=== INTERACTIVE CHECKS ===');
for (const [code, mod] of Object.entries(CONTENT)) {
  (mod.quiz || []).forEach((q, i) => {
    if ('choices' in q) {
      if (!Array.isArray(q.choices) || q.choices.length < 2) { console.log(`FAIL: ${code} quiz ${i} has invalid choices`); failures++; }
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= (q.choices || []).length) { console.log(`FAIL: ${code} quiz ${i} has invalid correct index`); failures++; }
    }
    if ('accept' in q && (!Array.isArray(q.accept) || !q.accept.length)) { console.log(`FAIL: ${code} quiz ${i} has invalid accept list`); failures++; }
  });
}

// ---------- interactive: every widget token references a registered id ----------
let tokenCount = 0;
for (const [code, mod] of Object.entries(CONTENT)) {
  const bodies = ['level0','level1','level2','level3','level4'].filter(k => mod[k]).map(k => mod[k].body)
    .concat(mod.repo ? [mod.repo.body] : []).concat(mod.exam ? [mod.exam.body] : []);
  for (const body of bodies) {
    const re = /\[\[(diagram|calc|match|order|terminal):([a-z0-9-]+)\]\]/g; let m;
    const REG = { diagram: DIAGRAMS, calc: CALCS, match: MATCHES, order: ORDERS, terminal: TERMINALS };
    while ((m = re.exec(body))) {
      tokenCount++;
      if (!REG[m[1]][m[2]]) { console.log(`FAIL: ${code} references unknown ${m[1]}: ${m[2]}`); failures++; }
    }
  }
}
console.log('widget tokens found:', tokenCount, '| diagrams:', Object.keys(DIAGRAMS).length, '| calcs:', Object.keys(CALCS).length);

// ---------- interactive: every {{glossary term}} resolves (registry or inline |override) ----------
let termCount = 0;
for (const [code, mod] of Object.entries(CONTENT)) {
  const bodies = ['level0','level1','level2','level3','level4'].filter(k => mod[k]).map(k => mod[k].body)
    .concat(mod.repo ? [mod.repo.body] : []).concat(mod.exam ? [mod.exam.body] : []);
  for (const body of bodies) {
    const re = /\[\[term:([^\]|]+)(?:\|([^\]]+))?\]\]/g; let m;
    while ((m = re.exec(body))) {
      termCount++;
      const hasOverride = m[2] != null;
      if (!hasOverride && !GLOSSARY[m[1].toLowerCase().trim()]) {
        console.log(`FAIL: ${code} uses undefined glossary term: [[term:${m[1]}]]`); failures++;
      }
    }
  }
}
console.log('glossary terms in content:', termCount, '| glossary entries:', Object.keys(GLOSSARY).length);

// ---------- interactive: hydrateWidgets must not throw headless ----------
try { hydrateWidgets(store['main']); hydrateWidgets(undefined); console.log('hydrateWidgets headless-safe: yes'); }
catch (e) { console.log('FAIL: hydrateWidgets threw headless:', e.message); failures++; }

// ---------- counts per module ----------
console.log('\n=== COUNTS ===');
const wordCount = s => (s.match(/[A-Za-z0-9'\-]+/g) || []).length;
for (const [code, mod] of Object.entries(CONTENT)) {
  const tasks = allTasks(code);
  let w = 0;
  ['level0','level1','level2','level3','level4'].filter(k => mod[k]).forEach(k => w += wordCount(mod[k].body));
  if (mod.repo) w += wordCount(mod.repo.body);
  if (mod.exam) w += wordCount(mod.exam.body);
  tasks.forEach(t => w += wordCount(t.d || '') + wordCount(t.t || ''));
  (mod.quiz || []).forEach(q => w += wordCount(q.q) + wordCount(q.a));
  console.log(`${code}: tasks=${tasks.length} repo-tagged=${tasks.filter(t=>t.repo).length} quiz=${(mod.quiz||[]).length} words~${w}`);
  if (!(mod.quiz || []).length) { console.log(`FAIL: ${code} has no quiz`); failures++; }
}

// ---------- scans ----------
console.log('\n=== SCANS ===');
const srcLines = src.split('\n');
const emDash = [];
srcLines.forEach((L, i) => { if (L.includes('—')) emDash.push(i + 1); });
console.log('em dash on file lines:', emDash.length ? emDash.join(', ') : 'none');
if (emDash.length) failures++;
const badEsc = [];
srcLines.forEach((L, i) => { if (/\\\\"/.test(L)) badEsc.push(i + 1); });
console.log('the \\\\" killer pattern:', badEsc.length ? 'lines ' + badEsc.join(', ') : 'none');
if (badEsc.length) failures++;
console.log('doctype present:', /^\s*<!doctype/i.test(src));
if (!/^\s*<!doctype/i.test(src)) failures++;

console.log('\n' + (failures ? `RESULT: ${failures} FAILURE(S) — do not hand the file over` : 'RESULT: ALL CHECKS PASS'));
process.exit(failures ? 1 : 0);
