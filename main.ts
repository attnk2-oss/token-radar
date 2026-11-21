// token-radar-01: the entry's program.
//
// The grader runs `node /bot/main.ts` with the sealed input mounted at /input and a writable /output,
// on one CPU, 1 GB of memory, no network and 120 seconds. Nothing here reads the clock, the network
// or the environment beyond the output path, so two runs on the same snapshot write the same bytes.
//
// What it writes, and why each file exists:
//   /output/board.json     the ranked board the gate's four data rows read, one row per protocol, and
//                          each row's decision at the page's first stake
//   /output/data.js        the same numbers, compact, for the page: it sits outside dashboard/ so the
//                          judge's 65,536-byte source window is spent on code, not on a data blob
//   /output/dashboard/     index.html and the two files it loads, copied from this repository
//   /output/screenshots/   the three views the judge sees first
//   /output/dossier.json   what the judge actually reads, written by the vendored library the scorer
//                          runs itself, so the two copies are byte for byte the same file
//
// Outside the grader, --input and MAKEFUN_OUTPUT_DIR stand in for the sealed paths:
//   node main.ts --input ./input/snapshot.json --output ./out

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, isPreToken, parseSnapshot, setAsideReason } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest only refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOTS = { max: 4, max_bytes: 524_288 };
const DASHBOARD = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const MIN_SHOTS = 3;

/** --name <value> from the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// Coverage is read from the snapshot, never from a literal: every pre-token protocol either ranks or
// names the watchlist rule that sets it aside. A pre-token protocol with no reason would be a bug in
// the board, so the build refuses it rather than shipping an unexplained absence.
const rankedSlugs = new Set(board.map((row) => row.slug));
const setAside = snapshot.protocols
  .filter((p) => isPreToken(p) && !rankedSlugs.has(p.slug))
  .map((p) => {
    const reason = setAsideReason(p);
    if (reason === null) {
      process.stderr.write(`token radar: ${p.slug} records no token, is not ranked, and matches no set-aside rule\n`);
      process.exit(1);
    }
    return { slug: p.slug, name: p.name, reason };
  })
  .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
const coverage = {
  total: snapshot.protocols.length,
  ranked: board.length,
  trading: snapshot.protocols.filter((p) => p.gecko_id !== null || p.symbol !== null).length,
  setAside,
};
if (coverage.ranked + coverage.trading + coverage.setAside.length !== coverage.total) {
  process.stderr.write(
    `token radar: coverage does not add up: ${coverage.ranked} ranked + ${coverage.trading} trading + ` +
      `${coverage.setAside.length} set aside ≠ ${coverage.total} in the snapshot\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `token radar: coverage ${coverage.total} = ${coverage.ranked} ranked + ${coverage.trading} trading + ` +
    `${coverage.setAside.length} set aside\n`,
);
radar.coverage = coverage;

/**
 * Copy a directory tree into the output, skipping dot names the way the gate reads a dashboard.
 * The dashboard keeps its subdirectories: the page's CSS and JS live under dashboard/s/ so that a
 * dossier's path-ordered source text reaches index.html before the assets, never after them.
 */
function copyTree(from: string, to: string): string[] {
  const copied: string[] = [];
  if (!existsSync(from)) return copied;
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      copied.push(...copyTree(path, join(to, name)));
      continue;
    }
    if (!stat.isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(join(to, name).slice(out.length + 1));
  }
  return copied;
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < MIN_SHOTS) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image(s); hand in ${MIN_SHOTS}: the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const shot of shots) {
  const name = shot.slice(shot.lastIndexOf('/') + 1);
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: ${shot}: a screenshot's name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Written last, from the files above: the scorer rebuilds it from the same directory and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOTS, dashboard: DASHBOARD }),
);

const byCategory = new Map<string, number>();
for (const row of board) {
  const key = row.category ?? 'Uncategorised';
  byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
}
const top = board[0]!;
const winner = radar.ladder.find((row) => row.chosen)!;
const flat = radar.ladder.find((row) => row.name === 'TVL × one multiple')!;
const verdicts = new Map<string, number>();
for (const row of board) verdicts.set(row.decision.verdict, (verdicts.get(row.decision.verdict) ?? 0) + 1);
const verdictLine = ['Worth farming', 'Marginal', 'Skip']
  .map((word) => `${verdicts.get(word) ?? 0} ${word.toLowerCase()}`)
  .join(', ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${radar.meta.pre_token} pre-token, ${board.length} ranked across ${byCategory.size} categories\n` +
    `token radar: model ${radar.meta.model_version} (${winner.name}), log10(mult) = ` +
    `${radar.curve.intercept.toFixed(3)} ${radar.curve.slope.toFixed(3)}*log10(tvl) ` +
    `${radar.curve.growth.toFixed(3)}*growth on ${radar.curve.sample} launches, residual ${radar.curve.residual_sd.toFixed(2)}\n` +
    `token radar: ladder walk-forward ${radar.ladder.map((row) => `${row.name} ${row.walkForward.toFixed(2)}x`).join(', ')}\n` +
    `token radar: out-of-sample miss ${winner.walkForward.toFixed(2)}x against ${flat.walkForward.toFixed(2)}x for one multiple, ` +
    `${Math.round(winner.withinThree * 100)}% within 3x, rank ${winner.rho.toFixed(2)}\n` +
    `token radar: rank 1 ${top.name} at $${(top.implied_value_usd / 1e6).toFixed(1)}M implied ` +
    `(value if launched $${(top.model.value_if_launched_usd / 1e6).toFixed(0)}M x ${top.model.launch_odds} odds, ` +
    `${top.decision.verdict.toLowerCase()} at $${top.decision.stake})\n` +
    `token radar: decisions at $${top.decision.stake}: ${verdictLine}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${board.length} rows, ${byCategory.size} categories), ` +
    `screenshots/ (${shots.length}) and dossier.json\n`,
);
