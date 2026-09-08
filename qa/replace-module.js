// Replaces an EXISTING module's CONTENT block in curriculum.html with a validated fragment, in place.
//   node qa/replace-module.js <path-to-fragment.js>
// 1. re-runs the validator (refuses anything invalid)
// 2. swaps the block between "/* ---- CODE ---- */\nCODE: {" and the next module comment (or the insert marker)
// Uses slicing, never String.replace, so fragment text containing $&, $` etc. is inserted verbatim.
// Does not touch TRACKS (the module's title, lede, covers, and repo stay as they are).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const fragPath = process.argv[2];
if (!fragPath) { console.log('REPLACE FAIL: no fragment path'); process.exit(1); }

try {
  execFileSync(process.execPath, [path.join(__dirname, 'fragment-validator.js'), fragPath], { stdio: 'pipe' });
} catch (e) {
  console.log('REPLACE FAIL: validator rejected fragment\n' + String(e.stdout || e.message));
  process.exit(1);
}

const { FRAGMENT_META } = require(path.resolve(fragPath));
const code = FRAGMENT_META.code;
const curPath = path.join(__dirname, '..', 'curriculum.html');
let cur = fs.readFileSync(curPath, 'utf8');

const src = fs.readFileSync(fragPath, 'utf8');
const begin = src.indexOf('// @@BEGIN@@'), end = src.indexOf('// @@END@@');
if (begin < 0 || end < 0 || end <= begin) { console.log('REPLACE FAIL: fragment markers broken'); process.exit(1); }
let block = src.slice(begin + '// @@BEGIN@@'.length, end).trim();
if (!block.startsWith('const FRAGMENT = {') || !block.endsWith('};')) {
  console.log('REPLACE FAIL: block must start with "const FRAGMENT = {" and end with "};"'); process.exit(1);
}
block = code + ': {' + block.slice('const FRAGMENT = {'.length, -2) + '},';

const header = '/* ---------------- ' + code + ' ---------------- */\n';
const head = header + code + ': {';
const a = cur.indexOf(head);
if (a < 0) { console.log('REPLACE FAIL: ' + code + ' block not found in curriculum.html'); process.exit(1); }
if (cur.indexOf(head, a + 1) >= 0) { console.log('REPLACE FAIL: ' + code + ' block found more than once'); process.exit(1); }
const after = a + head.length;
const nextC = cur.indexOf('\n/* ---------------- ', after);
const marker = cur.indexOf('/* @@MODULE-INSERT-POINT@@ */', after);
const stop = Math.min(nextC < 0 ? Infinity : nextC, marker < 0 ? Infinity : marker);
if (!isFinite(stop)) { console.log('REPLACE FAIL: could not find the end of the ' + code + ' block'); process.exit(1); }
const old = cur.slice(a, stop);
const trail = old.match(/\n*$/)[0];
cur = cur.slice(0, a) + header + block + trail + cur.slice(stop);
fs.writeFileSync(curPath, cur);
console.log(`REPLACED ${code} in curriculum.html (${old.length} -> ${header.length + block.length + trail.length} chars)`);
