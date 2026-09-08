// Validates one module fragment before it may be spliced into curriculum.html.
//   node qa/fragment-validator.js <path-to-fragment.js>
// Prints FRAGMENT OK on success, otherwise FAIL with reasons, exit 1.
//
// Fragment file contract (exact):
//   const FRAGMENT_META = {code:"A4", lede:"...", volatile:false};
//   // @@BEGIN@@
//   const FRAGMENT = {
//   hours:"25 to 35 hours",
//   level1:{name:"Foundation", body:`...`, tasks:[...]},
//   ... level4, repo:{body:`...`}, exam:{body:`...`}, quiz:[{q,a},...]
//   };
//   // @@END@@
//   module.exports = {FRAGMENT_META, FRAGMENT};

const fs = require('fs');
const path = require('path');

const fragPath = process.argv[2];
if (!fragPath) { console.log('FAIL: no fragment path given'); process.exit(1); }

const problems = [];
const warn = [];

// ---- load md() from the live curriculum (full script under a stub DOM, because md() depends on the glossary engine) ----
const curSrc = fs.readFileSync(path.join(__dirname, '..', 'curriculum.html'), 'utf8');
const jsMatch = curSrc.match(/<script>([\s\S]*?)<\/script>/);
if (!jsMatch) { console.log('FAIL: could not extract <script> from curriculum.html'); process.exit(1); }
{
  const store = {};
  const mkEl = (id) => ({ id, innerHTML: '', outerHTML: '', value: '', hidden: false, style: {}, files: [],
    classList: { toggle(){}, remove(){}, add(){}, contains(){ return false; } },
    addEventListener(){}, click(){}, querySelector(){ return mkEl('x'); }, querySelectorAll(){ return []; }, setAttribute(){}, getAttribute(){ return null; }, appendChild(){} });
  global.document = { getElementById(id){ return store[id] || (store[id] = mkEl(id)); }, querySelector(){ return mkEl('q'); }, querySelectorAll(){ return []; }, createElement(){ return mkEl('c'); }, body: mkEl('body') };
  global.window = { scrollTo(){} };
  global.alert = () => {};
  (0, eval)(jsMatch[1] + '\n;globalThis.__md = md;');
}
const md = globalThis.__md;

// ---- source-level checks ----
const src = fs.readFileSync(fragPath, 'utf8');
if (!src.includes('// @@BEGIN@@') || !src.includes('// @@END@@')) problems.push('missing @@BEGIN@@/@@END@@ markers');
if (src.includes('—')) problems.push('em dash found in source (forbidden everywhere)');
if (/\\\\"/.test(src)) problems.push('the \\\\" string-killer pattern found');
if (/\$\{/.test(src)) problems.push('${ found in source: template interpolation is forbidden in fragments');
if (/<\/script/i.test(src)) problems.push('literal </script found: it closes the page script tag early. Write <\\/script instead (renders the same).');

// ---- load ----
let META, FRAG;
try {
  const mod = require(path.resolve(fragPath));
  META = mod.FRAGMENT_META; FRAG = mod.FRAGMENT;
  if (!META || !FRAG) throw new Error('module.exports must be {FRAGMENT_META, FRAGMENT}');
} catch (e) {
  console.log('FAIL: fragment does not load: ' + e.message);
  process.exit(1);
}

// ---- shape ----
if (!/^[ABCX]\d+$/.test(META.code || '')) problems.push('FRAGMENT_META.code missing or malformed');
if (!META.lede || META.lede.length < 20) problems.push('FRAGMENT_META.lede missing or too short');
if (typeof META.volatile !== 'boolean') problems.push('FRAGMENT_META.volatile must be true or false');
if (!FRAG.hours) problems.push('hours missing');
const levels = ['level0','level1','level2','level3','level4'].filter(k => FRAG[k]);
if (!FRAG.level1 || !FRAG.level4) problems.push('level1..level4 required (level0 optional)');
const NAMES = ['Foundation','Working','Advanced','Mastery'];
['level1','level2','level3','level4'].forEach((k, i) => {
  if (FRAG[k] && FRAG[k].name !== NAMES[i]) problems.push(`${k}.name must be "${NAMES[i]}"`);
});
if (!FRAG.repo || !FRAG.repo.body) problems.push('repo.body missing');
if (!FRAG.exam || !FRAG.exam.body) problems.push('exam.body missing');
if (!Array.isArray(FRAG.quiz)) problems.push('quiz missing');

// ---- counts ----
const tasks = levels.flatMap(k => FRAG[k].tasks || []);
if (tasks.length < 12 || tasks.length > 16) problems.push(`task count ${tasks.length}, need 12-16`);
const repoTagged = tasks.filter(t => t.repo).length;
if (repoTagged < 5 || repoTagged > 7) problems.push(`repo-tagged tasks ${repoTagged}, need 5-7`);
const kSeen = new Set();
tasks.forEach(t => {
  if (!t.k || !t.t || !t.d) problems.push('task missing k/t/d: ' + JSON.stringify(t.k || t.t || '?').slice(0, 40));
  if (kSeen.has(t.k)) problems.push('duplicate task label: ' + t.k);
  kSeen.add(t.k);
});
if (FRAG.quiz && (FRAG.quiz.length < 18 || FRAG.quiz.length > 20)) problems.push(`quiz count ${FRAG.quiz.length}, need 18-20`);
(FRAG.quiz || []).forEach((q, i) => { if (!q.q || !q.a) problems.push('quiz item ' + i + ' missing q or a'); });

const wordCount = s => (String(s).match(/[A-Za-z0-9'\-]+/g) || []).length;
let words = 0;
levels.forEach(k => words += wordCount(FRAG[k].body));
words += wordCount(FRAG.repo && FRAG.repo.body) + wordCount(FRAG.exam && FRAG.exam.body);
tasks.forEach(t => words += wordCount(t.d) + wordCount(t.t));
(FRAG.quiz || []).forEach(q => words += wordCount(q.q) + wordCount(q.a));
if (words < 6200 || words > 8600) problems.push(`word count ~${words}, need 6200-8600`);

// ---- body rendering checks (same classes the harness enforces) ----
function fingerprint(line) {
  const runs = (line.match(/[A-Za-z][A-Za-z0-9 ,'.()/:;=_+\-]{11,}/g) || []).map(r => r.trim());
  runs.sort((a, b) => b.length - a.length);
  return runs[0];
}
const bodies = levels.map(k => [k, FRAG[k].body]).concat([['repo', FRAG.repo.body], ['exam', FRAG.exam.body]]);
for (const [name, body] of bodies) {
  const rawHtml = md(body);
  // strip glossary popup DEFINITIONS, then all tags, so auto-glossary/bold/code do not break contiguous-text matching (same as the harness)
  const html = rawHtml.replace(/<span class="term-pop">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');
  let fence = false;
  body.split('\n').forEach((L, idx) => {
    if (L.startsWith('```')) { fence = !fence; return; }
    if (!L.trim()) return;
    if (/^\[\[(diagram|calc|match|order|terminal):[a-z0-9-]+\]\]$/.test(L)) return;  // widget token: becomes a placeholder div
    const fp = fingerprint(L);
    if (fp && !html.includes(fp)) problems.push(`[${name}] line ${idx + 1} LOST in rendering: ${L.slice(0, 60)}`);
  });
  for (const bad of ['&amp;quot;', '&lt;code&gt;', '&lt;strong&gt;', '&lt;br&gt;', '&amp;amp;']) {
    if (rawHtml.includes(bad)) problems.push(`[${name}] double-escaped entity would show on page: ${bad} (use plain quotes/backticks in bodies)`);
  }
}

// ---- freshness banner for volatile modules ----
if (META.volatile && !/checked on 20\d\d-\d\d-\d\d/.test(FRAG.level1.body)) {
  problems.push('volatile module missing the freshness Watch-out ("checked on YYYY-MM-DD") at the top of level1');
}

// ---- analogy-collision warnings (taken modules own these props) ----
const TAKEN = ['receptionist','coat check','hotel','electricity meter','parking space','filing cabinet',
  'warehouse','mailroom','postcard','sticky note','photo album','photograph','bookmark','security camera',
  'repair shop','parcel','envelope','coat-check','halving game'];
const allBody = bodies.map(b => b[1]).join('\n').toLowerCase();
TAKEN.forEach(w => { if (allBody.includes(w)) warn.push(`analogy prop already used by A1/A2/A3: "${w}"`); });

// ---- verdict ----
warn.forEach(w => console.log('WARN: ' + w));
if (problems.length) {
  problems.forEach(p => console.log('FAIL: ' + p));
  console.log(`\nRESULT: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`FRAGMENT OK (${META.code}: tasks=${tasks.length}, repo=${repoTagged}, quiz=${FRAG.quiz.length}, words~${words})`);
