// An independent replica of the seven gate rows in input/README.md, run against an output directory.
// The real scorer is sealed and not in the kit, so this is the closest check available offline: it
// reads the same files the scorer reads and applies the same rules, written from the rules text.
//
//   node scripts/gate.mjs <output dir> <snapshot.json>
import { readFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapshotPath = process.argv[3] ?? 'input/snapshot.json';
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const slugs = new Set(snapshot.protocols.map((p) => p.slug));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

/* ---- dashboard_files ---- */
const dashDir = join(out, 'dashboard');
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isDirectory()) walk(path);
    else files.push({ path, name, size: st.size });
  }
}
try {
  walk(dashDir);
} catch (e) {
  add('dashboard_files', false, `dashboard/ unreadable: ${e.message}`);
}
const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const badName = files.find((f) => !NAME.test(f.name));
const totalBytes = files.reduce((s, f) => s + f.size, 0);
const hasHtml = files.some((f) => f.name === 'index.html');
const hasCss = files.some((f) => f.name.endsWith('.css'));
const hasJs = files.some((f) => f.name.endsWith('.js'));
const NET = /https?:\/\//i;
function scanNetwork(file) {
  const text = readFileSync(file.path, 'utf8');
  if (file.name.endsWith('.css')) {
    // any occurrence in a stylesheet is refused
    const at = text.search(NET);
    return at >= 0 ? `CSS names a network address at byte ${at}` : null;
  }
  if (file.name.endsWith('.js')) {
    // import / export-from / require / dynamic import specifiers
    const spec = /(?:^|[^.\w])(?:import|export|require)\s*\(?\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = spec.exec(text)) !== null) if (NET.test(m[1])) return `JS import names ${m[1]}`;
    return null;
  }
  if (file.name.endsWith('.html')) {
    const attr = /\b(?:href|src|action|poster|data|cite)\s*=\s*['"]([^'"]*)['"]/gi;
    let m;
    while ((m = attr.exec(text)) !== null) if (NET.test(m[1])) return `HTML attribute names ${m[1]}`;
    const style = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    while ((m = style.exec(text)) !== null) if (NET.test(m[1])) return 'inline <style> names a network address';
    return null;
  }
  return null;
}
let netIssue = null;
for (const f of files) {
  const issue = scanNetwork(f);
  if (issue) { netIssue = `${relative(out, f.path)}: ${issue}`; break; }
}
add('dashboard_files', files.length > 0 && hasHtml && hasCss && hasJs && files.length <= 400 && totalBytes <= 4 * 1024 * 1024 && !badName && !netIssue,
  badName ? `bad name ${badName.name}` : netIssue ? netIssue : `${files.length} files, ${totalBytes} bytes, index+css+js present`);

/* ---- board_file ---- */
const boardBytes = readFileSync(join(out, 'board.json'));
const board = JSON.parse(boardBytes.toString('utf8'));
const rows = Array.isArray(board) ? board : board.rows;
const rowIssue = (() => {
  if (!Array.isArray(rows)) return 'rows is not an array';
  if (rows.length < 100 || rows.length > 4000) return `${rows.length} rows`;
  for (const r of rows) {
    if (typeof r.slug !== 'string' || !slugs.has(r.slug)) return `unknown slug ${r.slug}`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `empty name at ${r.slug}`;
    if (!Number.isInteger(r.rank) || r.rank < 1) return `bad rank at ${r.slug}`;
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `bad implied at ${r.slug}`;
    if (!Array.isArray(r.farm_steps)) return `no farm_steps at ${r.slug}`;
  }
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'every implied value is equal';
  if (boardBytes.length > 8 * 1024 * 1024) return 'over 8 MiB';
  return null;
})();
add('board_file', rowIssue === null, rowIssue ?? `${rows.length} rows, ${boardBytes.length} bytes`);

/* ---- sorted_by_value ---- */
const orderIssue = (() => {
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i += 1) if (ranks[i] !== i + 1) return `rank ${i + 1} missing`;
  let prev = Infinity;
  for (const r of rows) {
    if (r.implied_value_usd > prev) return `rank ${r.rank} is worth more than the one above`;
    prev = r.implied_value_usd;
  }
  return null;
})();
add('sorted_by_value', orderIssue === null, orderIssue ?? 'ranks 1..N, implied non-increasing');

/* ---- coverage ---- */
const covered = new Set(rows.map((r) => r.slug));
const missing = snapshot.watchlist.filter((s) => !covered.has(s));
add('coverage', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${snapshot.watchlist.length}/${snapshot.watchlist.length}`);

/* ---- farm_steps ---- */
const stepIssue = (() => {
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} steps`;
    for (const s of r.farm_steps) {
      if (typeof s !== 'string') return `${r.slug}: a step is not a string`;
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug}: a step is ${t.length} characters`;
    }
  }
  return null;
})();
add('farm_steps', stepIssue === null, stepIssue ?? 'every row 3-12 steps of 20-600 characters');

/* ---- screenshots ---- */
const shotDir = join(out, 'screenshots');
const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.')).sort();
const shotIssues = [];
function pngSize(buf) {
  if (buf.length < 24) return null;
  const magic = buf.subarray(0, 8).toString('hex');
  if (magic !== '89504e470d0a1a0a') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
if (shots.length < 3 || shots.length > 4) shotIssues.push(`${shots.length} images`);
for (const name of shots) {
  const p = join(shotDir, name);
  const st = lstatSync(p);
  const buf = readFileSync(p);
  if (!st.isFile()) shotIssues.push(`${name} not a regular file`);
  if (st.size > 512 * 1024) shotIssues.push(`${name} is ${st.size} bytes`);
  if (!NAME.test(name)) shotIssues.push(`${name} bad name`);
  const dim = pngSize(buf);
  if (!dim) shotIssues.push(`${name} not a whole PNG`);
  else {
    const long = Math.max(dim.w, dim.h);
    const short = Math.min(dim.w, dim.h);
    if (long > 1440) shotIssues.push(`${name} long side ${long}`);
    if (short < 800) shotIssues.push(`${name} short side ${short}`);
  }
}
add('screenshots', shotIssues.length === 0, shotIssues.length ? shotIssues.join('; ') : shots.map((n) => `${n} ${lstatSync(join(shotDir, n)).size}b`).join(', '));

/* ---- dossier_matches ---- */
// buildDossier hands back bytes; comparing that to the file's utf8 string with === is always false.
const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65536 }));
const onDisk = readFileSync(join(out, 'dossier.json'));
const same = Buffer.compare(rebuilt, onDisk) === 0;
add('dossier_matches', same && onDisk.length <= 1.5 * 1024 * 1024,
  same ? `${onDisk.length} bytes, byte-identical to a rebuild` : 'dossier.json differs from buildDossier');

const textBytes = Buffer.byteLength(JSON.parse(onDisk.toString('utf8')).text, 'utf8');
let width = 0;
for (const c of checks) width = Math.max(width, c.name.length);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.detail}`);
console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} pass; dossier text ${textBytes} UTF-8 bytes; dashboard ${totalBytes} bytes`);
process.exit(checks.every((c) => c.ok) ? 0 : 1);
