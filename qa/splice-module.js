// Splices a validated fragment into curriculum.html.
//   node qa/splice-module.js <path-to-fragment.js>
// 1. re-runs the validator (refuses to splice anything invalid)
// 2. inserts the FRAGMENT source text as `CODE: {...},` at the insert marker
// 3. injects the lede into the module's TRACKS entry
// Idempotent-safe: refuses if the module code already exists in CONTENT.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const fragPath = process.argv[2];
if (!fragPath) { console.log('SPLICE FAIL: no fragment path'); process.exit(1); }

// 1. validator gate
try {
  execFileSync(process.execPath, [path.join(__dirname, 'fragment-validator.js'), fragPath], { stdio: 'pipe' });
} catch (e) {
  console.log('SPLICE FAIL: validator rejected fragment\n' + String(e.stdout || e.message));
  process.exit(1);
}

const { FRAGMENT_META } = require(path.resolve(fragPath));
const code = FRAGMENT_META.code;
const lede = FRAGMENT_META.lede;

const curPath = path.join(__dirname, '..', 'curriculum.html');
let cur = fs.readFileSync(curPath, 'utf8');

const MARKER = '/* @@MODULE-INSERT-POINT@@ */';
if (!cur.includes(MARKER)) { console.log('SPLICE FAIL: insert marker missing in curriculum.html'); process.exit(1); }
if (new RegExp('^' + code + ': \\{', 'm').test(cur)) { console.log(`SPLICE FAIL: ${code} already exists in CONTENT`); process.exit(1); }

// 2. extract fragment source text between markers
const src = fs.readFileSync(fragPath, 'utf8');
const begin = src.indexOf('// @@BEGIN@@');
const end = src.indexOf('// @@END@@');
if (begin < 0 || end < 0 || end <= begin) { console.log('SPLICE FAIL: fragment markers broken'); process.exit(1); }
let block = src.slice(begin + '// @@BEGIN@@'.length, end).trim();
if (!block.startsWith('const FRAGMENT = {') || !block.endsWith('};')) {
  console.log('SPLICE FAIL: block must start with "const FRAGMENT = {" and end with "};"');
  process.exit(1);
}
block = code + ': {' + block.slice('const FRAGMENT = {'.length, -2) + '},';

// function replacement: fragment text may contain $, $&, $`, etc. which a STRING
// replacement would interpret and corrupt. A function return is used verbatim.
const insertion = `/* ---------------- ${code} ---------------- */\n${block}\n\n${MARKER}`;
cur = cur.replace(MARKER, () => insertion);

// 3. lede into TRACKS (skip if one already present)
const trackRe = new RegExp('\\{c:"' + code + '",t:"([^"]+)",covers:');
if (trackRe.test(cur)) {
  cur = cur.replace(trackRe, (m, title) => `{c:"${code}",t:"${title}",\n lede:${JSON.stringify(lede)},covers:`);
} else if (!new RegExp('\\{c:"' + code + '",t:"[^"]+",\\s*\\n?\\s*lede:').test(cur)) {
  console.log(`SPLICE FAIL: could not find TRACKS entry for ${code}`);
  process.exit(1);
}

fs.writeFileSync(curPath, cur);
console.log(`SPLICED ${code} (+ lede) into curriculum.html`);
