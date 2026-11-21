// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The question is narrow. A protocol has TVL, a seven-day TVL change and a date DefiLlama started
// tracking it, and it records no token. What would that token be worth today, how likely is one at
// all, and what would farming it pay before it exists?
//
// v4 answers the third question, which v3 left to the reader. Every row now carries an interval
// measured from the curve's own residuals, and a decision at four stake sizes: the slice a position
// would receive if the launch happened, the net after gas and the cost of the capital, the break-even
// the launch has to clear, the net per hour of attention, and one verdict word.
//
// The value model is the sixth version tried against this snapshot, and `main.ts` prints the test
// rather than the claim. The ladder is cumulative, one term per rung:
//
//   1. one market-wide multiple           LOO 4.00x   walk-forward 3.61x
//   2. a size curve (mcap/TVL falls)      LOO 3.22x   walk-forward 2.98x
//   3. the same curve, Huber weights      LOO 3.24x   walk-forward 2.97x
//   4. + family offsets                   LOO 3.07x   walk-forward 2.80x
//   5. + fitted 7-day growth              LOO 3.07x   walk-forward 2.79x
//   6. + fitted listing age               LOO 3.09x   walk-forward 3.46x
//
// Two terms survive out of sample. Family (DefiLlama's category) is the only one that pays: the same
// $100M of TVL is worth measurably more as a lending market than as a risk curator. Growth is worth
// nothing measurable (its coefficient is -0.055 in log10, so a week of +30% TVL moves a value by two
// per cent, downward) and it is kept because it costs nothing and the brief expects it to be tried.
// Listing age makes the model worse out of sample (3.46x against 2.79x), so it is dropped: it still
// sets how long a plan takes and how many hours it costs, which is where it belongs.
//
// So:
//
//   log10(mult) = intercept + slope*log10(tvl) + growth_coef*tanh(clamp(d7d)/30) + family(category)
//   implied     = tvl * 10^log10(mult) * launch_odds(category)
//
// Every coefficient is fitted on the 115 protocols whose token already trades, and no protocol name
// is special-cased anywhere: the same function scores all 198 candidates.
//
// Two older decisions still hold:
//
//   * Structural exclusions. The watchlist's own rule (input/README.md) drops exchanges, bridges,
//     liquid staking and wrapped or staked products of a token that already trades, because those are
//     not protocols waiting on a launch. That rule is applied to the whole field, not just to
//     protocols above the $50M floor: the floor moves, the rule does not. Without it the board's top
//     rows are Bybit, WBTC and Coinbase Bridge.
//
//   * The board is every candidate, not the watchlist. All 40 watchlist protocols are ranked and
//     flagged, but so are 158 below the floor, because a radar that only sees the house's list is a
//     filter, not a radar.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, printed on the page and named in the method block. */
export const MODEL_VERSION = 'radar-4';

/** How the board is drawn: every rankable protocol, and never fewer than the gate's floor of 100. */
export const BOARD_MIN_ROWS = 100;

/** The constants the fit is held to. These shape the model; the assumptions below price the plan. */
export const MODEL = {
  /** A week of TVL growth enters as tanh(d7d / scale): bounded, so one outlier week cannot run away. */
  growth_scale_pct: 30,
  growth_floor_pct: -60,
  growth_cap_pct: 150,
  /** The slope the size curve is allowed to take: never up, never steeper than this. */
  slope_floor: -0.7,
  slope_cap: 0,
  /** The curve's output is clamped to this band of the multiples the snapshot itself shows. */
  clamp_quantile_low: 0.05,
  clamp_quantile_high: 0.95,
  /** Pseudo-count of protocols pulling a family's offset back to the whole market. */
  family_shrink: 6,
  /** Pseudo-count of protocols pulling a category's launch odds to the market's. */
  shrink_odds: 6,
  /** Ratios outside this band are not market prices, they are data errors or dust. */
  ratio_floor: 0.01,
  ratio_cap: 20,
  /** Where a missing seven-day change or listing date is read as the middle of the sample. */
  neutral_age_days: 365,
  /** Residuals are read through a Gaussian kernel this wide, in log10 TVL: a decade either way. */
  band_bandwidth: 0.7,
  /** Huber's tuning constant, in robust standard deviations. */
  huber_c: 1.5,
  huber_iterations: 12,
} as const;

/**
 * What a plan costs and what an hour is worth. Every one of these is printed on the page, because a
 * decision the reader cannot argue with is a decision they have to take on faith.
 */
export const ASSUMPTIONS = {
  /** Gas for one transaction on a chain, in dollars: named chains, then a default. */
  gas_usd: [
    { chain: 'Ethereum', usd: 12 },
    { chain: 'Arbitrum', usd: 0.6 },
    { chain: 'Base', usd: 0.5 },
    { chain: 'Optimism', usd: 0.5 },
    { chain: 'Solana', usd: 0.15 },
    { chain: 'BSC', usd: 0.3 },
    { chain: 'Tron', usd: 0.5 },
  ],
  gas_default_usd: 0.6,
  /** A position is opened and closed: two transactions, not one. */
  gas_trips: 2,
  /** The stake sizes the page switches between. The first is the one board.json's decision block uses. */
  stake_tiers: [1000, 5000, 10000, 50000],
  /**
   * The share of a launch's market cap that reaches the deposit pool. The snapshot carries supply,
   * float and airdrop data for nothing, so this is the one number the model cannot fit; it is set at
   * the middle of the range a points programme has actually paid (5% to 25% of a launch's value to
   * the users who provided the liquidity) and every row prints the break-even that would replace it.
   */
  pool_share: 0.15,
  /** What the staked capital could have earned elsewhere, a year, in decimals. */
  capital_cost_apr: 0.05,
  /** Hours of attention: opening, closing, and a weekly look at the position. */
  setup_hours: 0.5,
  exit_hours: 0.5,
  review_hours_per_week: 0.25,
  /** What an hour of the reader's attention is worth. The verdict is measured against this. */
  labour_usd_per_hour: 25,
  /** How long to hold before judging it, by the protocol's age: young protocols need a longer window. */
  hold_days: [
    { age_floor: 730, days: 30 },
    { age_floor: 365, days: 40 },
    { age_floor: 180, days: 45 },
    { age_floor: 0, days: 60 },
  ],
} as const;

/** One launched protocol: the market's own answer, and the raw material of every fit. */
export interface Multiple {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
}

/** One rung of the ladder: what it adds, and how it scored under the same four tests. */
export interface Variant {
  key: string;
  label: string;
  adds: string;
  /** The terms on top of size. Cumulative: the last rung has both. */
  features: ('growth' | 'age')[];
  robust: boolean;
  family: boolean;
  flat: boolean;
}

export const LADDER: Variant[] = [
  { key: 'flat', label: 'TVL × one multiple', adds: 'the geometric mean of every traded multiple', features: [], robust: false, family: false, flat: true },
  { key: 'curve', label: 'size curve', adds: 'log10(mcap/TVL) on log10(TVL)', features: [], robust: false, family: false, flat: false },
  { key: 'huber', label: '+ Huber weights', adds: 'the same curve, refitted with outliers down-weighted', features: [], robust: true, family: false, flat: false },
  { key: 'family', label: '+ family offsets', adds: "DefiLlama's category as a shrunk intercept", features: [], robust: false, family: true, flat: false },
  { key: 'growth', label: '+ fitted 7-day growth', adds: 'tanh(Δ7d / 30) as a second regressor', features: ['growth'], robust: false, family: true, flat: false },
  { key: 'age', label: '+ fitted listing age', adds: 'log10(1 + days tracked) as a third', features: ['growth', 'age'], robust: false, family: true, flat: false },
];

/** A fitted model: the coefficients, the family offsets, and how much it misses by on its own sample. */
export interface ModelFit {
  variant: string;
  flat: boolean;
  intercept: number;
  slope: number;
  growth: number;
  age: number;
  /** log10 offsets over the size curve, one per family, shrunk toward zero. */
  family: Map<string, number>;
  sample: number;
  /** Residual standard deviation in log10: 10^sd is the typical factor of a miss. */
  residual_sd: number;
  clamp_low: number;
  clamp_high: number;
}

/** A size band, for the page's table: how the field actually prices itself by size. */
export interface SizeBand {
  label: string;
  floor_usd: number;
  ceiling_usd: number | null;
  launched: number;
  median_multiple: number;
}

/** One category's launch odds: how often a protocol of that kind ever records a token. */
export interface CategoryOdds {
  key: string;
  protocols: number;
  launched: number;
  raw_rate: number;
  odds: number;
}

/** One out-of-sample split: fit on protocols listed before the cutoff, score the ones after it. */
export interface ValidationSplit {
  cutoff: string;
  fit: number;
  test: number;
  miss: number;
  within_3x: number;
  rank_correlation: number;
}

/** One rung's score, as the page's comparison table shows it. */
export interface LadderScore extends Variant {
  fit_sample: number;
  loo_miss: number;
  within_3x: number;
  rank_correlation: number;
  walk_forward: number;
  splits: ValidationSplit[];
  chosen: boolean;
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row's decision at one stake: every number the reader needs, and the word at the end. */
export interface Decision {
  stake: number;
  /** Dollars of token a position this size would receive if the launch happened at the modelled value. */
  slice_usd: number;
  /** slice − gas − the cost of the capital over the hold. */
  net_if_launch_usd: number;
  /** The same, weighted by the category's launch odds: what the farm is worth before it happens. */
  net_usd: number;
  /** How far above the model the launch has to land, after the odds, for the bet to pay. 1.0 = at the model. */
  break_even: number;
  /** The share of the launch's value that must reach depositors, after the odds. Independent of the 15%. */
  break_even_pool: number;
  /** Dollars of cost: two transactions' gas plus the capital's opportunity cost. */
  cost_usd: number;
  hours: number;
  net_per_hour: number;
  verdict: 'Worth farming' | 'Marginal' | 'Skip';
}

/** A ranked row as board.json carries it: the gate reads the first fields, the rest is the argument. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    version: string;
    size_multiple: number;
    family_offset: number;
    growth_multiplier: number;
    launch_odds: number;
    value_if_launched_usd: number;
    band_p10_usd: number;
    band_p90_usd: number;
  };
  decision: Decision;
  farm_steps: string[];
}

/** A row as the dashboard carries it: short keys, because the page ships this file. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  cat: string;
  chains: string[];
  tvl: number;
  ch: number | null;
  listed: string | null;
  age: number | null;
  /** The pure size curve at this TVL, before the family offset and the growth term. */
  sz: number;
  mult: number;
  odds: number;
  mo: number;
  fam: number;
  ifl: number;
  implied: number;
  /** The band on the implied value: P10, P25, P75, P90. */
  band: [number, number, number, number];
  /** Hold days, gas per transaction, hours of attention: the plan's own numbers, per row. */
  hold: number;
  gas: number;
  hours: number;
  watch: boolean;
  farm: FarmStep[];
  /** One decision per stake tier, in the order of ASSUMPTIONS.stake_tiers. */
  dec: Decision[];
}

/** One point of the scatter: a traded token, or a protocol priced by the curve. */
export interface ScatterPoint {
  slug: string;
  name: string;
  tvl: number;
  value: number;
  /** 0 = traded and in the fit, 1 = traded and set aside, 2 = no token yet, 3 = on the watchlist. */
  kind: number;
}

/** One rung as data.js carries it: the four tests, and whether the board prices on it. */
export interface LadderRow {
  name: string;
  loo: number;
  withinThree: number;
  rho: number;
  walkForward: number;
  chosen: boolean;
}

/** One pre-token protocol kept off the board, and the rule that kept it there. */
export interface SetAside {
  slug: string;
  name: string;
  reason: string;
}

/** The snapshot's 758 protocols, all accounted for. */
export interface Coverage {
  total: number;
  ranked: number;
  trading: number;
  setAside: SetAside[];
}

/** Everything the page needs: the board, the ladder behind it, the band and the decision. */
export interface RadarData {
  meta: {
    as_of: string;
    source: string;
    floor_usd: number;
    model_version: string;
    protocols: number;
    watchlist: number;
    watchlist_covered: number;
    pre_token: number;
    ranked: number;
  };
  model: typeof MODEL;
  assumptions: typeof ASSUMPTIONS;
  market: { protocols: number; launched: number; launch_rate: number; median_multiple: number; multiples: number };
  curve: {
    variant: string;
    intercept: number;
    slope: number;
    growth: number;
    sample: number;
    residual_sd: number;
    clamp_low: number;
    clamp_high: number;
    family: { key: string; offset: number; launched: number }[];
  };
  bands: SizeBand[];
  odds: CategoryOdds[];
  ladder: LadderRow[];
  splits: ValidationSplit[];
  coverage?: Coverage;
  /** The residual quantiles the row bands are drawn from, at the sample's own TVL. */
  residual: { p10: number; p25: number; p75: number; p90: number };
  /** The P25-P75 band as a path: the model's multiple and its interquartile range at each of 21 TVLs. */
  band_curve: { tvl: number; mult: number; lo: number; hi: number }[];
  rows: RadarRow[];
  live: Multiple[];
  scatter: ScatterPoint[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/**
 * Read the snapshot's bytes into the shape above, and refuse anything that is not that shape. The
 * gate hands this program one sealed file, so a malformed one is a bug in the entry, never a reason
 * to guess: a missing field would quietly become a zero in the model and a zero would rank last.
 */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new SnapshotError(`the snapshot is not JSON: ${(error as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null) throw new SnapshotError('the snapshot is not an object');
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string') throw new SnapshotError('the snapshot carries no as_of date');
  if (typeof doc.floor_usd !== 'number' || !Number.isFinite(doc.floor_usd)) {
    throw new SnapshotError('the snapshot carries no floor_usd');
  }
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('the snapshot carries no protocols');
  if (!Array.isArray(doc.watchlist)) throw new SnapshotError('the snapshot carries no watchlist');
  const protocols: SnapshotProtocol[] = [];
  const slugs = new Set<string>();
  for (const entry of doc.protocols as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new SnapshotError('a protocol is not an object');
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0) throw new SnapshotError('a protocol has no slug');
    if (slugs.has(p.slug)) throw new SnapshotError(`the snapshot repeats the slug ${p.slug}`);
    slugs.add(p.slug);
    if (typeof p.name !== 'string') throw new SnapshotError(`the protocol ${p.slug} has no name`);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`the protocol ${p.slug} has no TVL`);
    }
    const chains = Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [];
    const nullable = (key: string): string | null =>
      typeof p[key] === 'string' && (p[key] as string).length > 0 ? (p[key] as string) : null;
    const optionalNumber = (key: string): number | null =>
      typeof p[key] === 'number' && Number.isFinite(p[key] as number) ? (p[key] as number) : null;
    protocols.push({
      slug: p.slug,
      name: p.name,
      category: nullable('category'),
      chains,
      tvl_usd: p.tvl_usd,
      change_7d: optionalNumber('change_7d'),
      mcap_usd: optionalNumber('mcap_usd'),
      listed_at: nullable('listed_at'),
      gecko_id: nullable('gecko_id'),
      symbol: nullable('symbol'),
    });
  }
  const watchlist = (doc.watchlist as unknown[]).filter((s): s is string => typeof s === 'string');
  return {
    as_of: doc.as_of,
    source: typeof doc.source === 'string' ? doc.source : 'DefiLlama api.llama.fi/protocols',
    floor_usd: doc.floor_usd,
    protocols,
    watchlist,
  };
}

const DAY_MS = 86_400_000;

/** A finite number, else the fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whether an entry records no token at all: the three fields DefiLlama fills when one trades. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version marker: a name that ends in a release is a pool of another protocol, not a protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories whose protocols are a trading venue or a product of a token that already trades. */
const NOT_A_LAUNCH = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whole words that mark a protocol as somebody else's token wrapped or staked. */
const DERIVATIVE_NAME = /\b(wrapped|staked|staking)\b/i;

/** Exchanges whose products are not a protocol waiting on a launch of its own. */
const EXCHANGE_PREFIX = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/**
 * The watchlist's structural rule, as one reason or null: a protocol set aside because it is a venue
 * or a derivative of a token that already trades is never a launch candidate. This is the single
 * implementation both the board and the coverage accounting read, so the two cannot drift.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return `${p.category} category`;
  if (VERSIONED.test(p.name)) return 'versioned name';
  if (DERIVATIVE_NAME.test(p.name)) return 'wrapped / staked wording';
  return EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix)) ? 'exchange product name' : null;
}

/**
 * Whether a protocol is a launch candidate at all: the watchlist's structural rule from
 * input/README.md, applied to the whole field rather than to the protocols above its $50M floor.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  return isPreToken(p) && setAsideReason(p) === null;
}

/** A whole day count from listed_at to the snapshot's date; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol's market cap over its TVL, when both are usable: the ratio every fit is built on. */
function ratioOf(p: SnapshotProtocol): number | null {
  if (p.tvl_usd <= 0) return null;
  const mcap = p.mcap_usd;
  if (mcap === null || mcap <= 0) return null;
  const ratio = mcap / p.tvl_usd;
  return ratio >= MODEL.ratio_floor && ratio <= MODEL.ratio_cap ? ratio : null;
}

/** Every launched protocol with a usable ratio, largest multiple first: the fit's raw material. */
export function multiplesOf(protocols: SnapshotProtocol[], asOf: string): Multiple[] {
  const out: Multiple[] = [];
  for (const p of protocols) {
    const multiple = ratioOf(p);
    if (multiple === null || p.mcap_usd === null) continue;
    out.push({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorised',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      multiple,
      change_7d: p.change_7d,
      age_days: ageDays(asOf, p.listed_at),
      listed_at: p.listed_at,
    });
  }
  return out.sort((a, b) => b.multiple - a.multiple || (a.slug < b.slug ? -1 : 1));
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The quantile of a sorted sample, linearly interpolated. */
const quantileSorted = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
};

const quantile = (xs: number[], q: number): number => quantileSorted([...xs].sort((a, b) => a - b), q);

/** The growth term every rung after the fourth carries: bounded, centred on zero, missing reads neutral. */
export function growthTerm(change7d: number | null): number {
  const change = finite(change7d, 0);
  const clamped = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, change));
  return Math.tanh(clamped / MODEL.growth_scale_pct);
}

/** The age term the sixth rung carries: a decade of tracking, so a coefficient is per ten-fold. */
export function ageTerm(ageDaysValue: number | null): number {
  return Math.log10(1 + (ageDaysValue ?? MODEL.neutral_age_days));
}

/** One point of the fit, as a plain object: what every rung reads and what `predictLog` sees. */
interface FitPoint {
  category: string;
  tvl_usd: number;
  logMultiple: number;
  growth: number;
  age: number;
}

/** A launched protocol, as the fit reads it. */
export function fitPointOf(m: Multiple): FitPoint {
  return {
    category: m.category,
    tvl_usd: m.tvl_usd,
    logMultiple: Math.log10(m.multiple),
    growth: growthTerm(m.change_7d),
    age: ageTerm(m.age_days),
  };
}

/** The design row of one point under one rung: intercept, size, then the rung's own terms. */
function designRow(p: FitPoint, v: Variant): number[] {
  const row = [1, Math.log10(p.tvl_usd)];
  if (v.features.includes('growth')) row.push(p.growth);
  if (v.features.includes('age')) row.push(p.age);
  return row;
}

/** Solve a small dense system by Gauss-Jordan. A singular column keeps its coefficient at zero. */
function solve(A: number[][], b: number[]): number[] {
  const k = b.length;
  const m = A.map((row) => [...row]);
  const x = [...b];
  for (let i = 0; i < k; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < k; r += 1) if (Math.abs(m[r]![i]!) > Math.abs(m[pivot]![i]!)) pivot = r;
    if (Math.abs(m[pivot]![i]!) < 1e-12) continue;
    [m[i], m[pivot]] = [m[pivot]!, m[i]!];
    [x[i], x[pivot]] = [x[pivot]!, x[i]!];
    const d = m[i]![i]!;
    for (let c = i; c < k; c += 1) m[i]![c] = m[i]![c]! / d;
    x[i] = x[i]! / d;
    for (let r = 0; r < k; r += 1) {
      if (r === i) continue;
      const f = m[r]![i]!;
      if (f === 0) continue;
      for (let c = i; c < k; c += 1) m[r]![c] = m[r]![c]! - f * m[i]![c]!;
      x[r] = x[r]! - f * x[i]!;
    }
  }
  return x.map((v) => (Number.isFinite(v) ? v : 0));
}

/** Weighted normal equations: one pass, then the solve. */
function weightedFit(points: FitPoint[], v: Variant, weights: number[]): number[] {
  const rows = points.map((p) => designRow(p, v));
  const k = rows[0]!.length;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < points.length; i += 1) {
    const w = weights[i]!;
    for (let a = 0; a < k; a += 1) {
      b[a] = b[a]! + w * rows[i]![a]! * points[i]!.logMultiple;
      for (let c = 0; c < k; c += 1) A[a]![c] = A[a]![c]! + w * rows[i]![a]! * rows[i]![c]!;
    }
  }
  return solve(A, b);
}

/** Ordinary least squares, which is what every rung but the Huber one uses. */
function ols(points: FitPoint[], v: Variant): number[] {
  return weightedFit(points, v, new Array<number>(points.length).fill(1));
}

/**
 * Huber's IRLS: fit, read the residuals' robust spread, down-weight the points past 1.5 of it,
 * refit. Bounded influence, so one token trading at 19x its TVL cannot tilt the curve.
 */
function huber(points: FitPoint[], v: Variant): number[] {
  let coef = ols(points, v);
  let weights = new Array<number>(points.length).fill(1);
  for (let it = 0; it < MODEL.huber_iterations; it += 1) {
    coef = weightedFit(points, v, weights);
    const residuals = points.map((p, i) => p.logMultiple - dot(designRow(p, v), coef));
    const scale = 1.4826 * median(residuals.map((r) => Math.abs(r))) || 1e-9;
    weights = residuals.map((r) => {
      const u = Math.abs(r) / (MODEL.huber_c * scale);
      return u <= 1 ? 1 : 1 / u;
    });
  }
  return coef;
}

const dot = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
};

/**
 * The family offsets: the mean residual of each category, shrunk toward zero by a pseudo-count. A
 * family with two launches speaks at a quarter strength; one with forty speaks for itself.
 */
function familyOffsets(points: FitPoint[], v: Variant, coef: number[]): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const residual = p.logMultiple - dot(designRow(p, v), coef);
    const bucket = acc.get(p.category);
    if (bucket === undefined) acc.set(p.category, { sum: residual, n: 1 });
    else {
      bucket.sum += residual;
      bucket.n += 1;
    }
  }
  const out = new Map<string, number>();
  for (const [key, { sum, n }] of acc) out.set(key, sum / (n + MODEL.family_shrink));
  return out;
}

/** Fit one rung on one sample. The only entry point every test and the board itself use. */
export function fitVariant(points: FitPoint[], v: Variant): ModelFit {
  if (points.length < 8) throw new SnapshotError(`the snapshot carries too few launched protocols to fit ${v.key}`);
  // The flat rung is one number: the mean of log10(multiple), fitted with no slope column at all. It
  // used to be an ordinary fit with its slope forced to zero afterwards, which left the intercept at
  // the height of a sloped line and priced the whole field at 10^4.9.
  const meanY = points.reduce((sum, p) => sum + p.logMultiple, 0) / points.length;
  const coef = v.flat ? [meanY, 0] : v.robust ? huber(points, v) : ols(points, v);
  const slopeRaw = v.flat ? 0 : coef[1]!;
  const slope = Math.min(MODEL.slope_cap, Math.max(MODEL.slope_floor, slopeRaw));
  const growth = v.features.includes('growth') ? coef[2]! : 0;
  const age = v.features.includes('age') ? coef[3]! : 0;
  // When the clamp moves the slope, the line is rotated around the sample's own centre rather than
  // translated: the fitted intercept moves with the slope by exactly this much at the mean, and stays
  // where the fit put it when the clamp does nothing. Re-deriving it from the means instead would have
  // overruled the weights in the Huber fit, which do not pass through the unweighted means.
  const meanX = points.reduce((s, p) => s + Math.log10(p.tvl_usd), 0) / points.length;
  const intercept = coef[0]! + (slope - slopeRaw) * meanX;
  const base: ModelFit = {
    variant: v.key,
    flat: v.flat,
    intercept,
    slope,
    growth,
    age,
    family: new Map(),
    sample: points.length,
    residual_sd: 0,
    clamp_low: 0,
    clamp_high: 0,
  };
  if (v.family) base.family = familyOffsets(points, v, coef);
  const residuals = points.map((p) => p.logMultiple - predictLog(base, p));
  base.residual_sd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / points.length);
  const observed = points.map((p) => 10 ** p.logMultiple).sort((a, b) => a - b);
  base.clamp_low = quantileSorted(observed, MODEL.clamp_quantile_low);
  base.clamp_high = quantileSorted(observed, MODEL.clamp_quantile_high);
  if (!Number.isFinite(base.intercept) || !Number.isFinite(base.slope)) {
    throw new SnapshotError(`the ${v.key} fit did not converge`);
  }
  return base;
}

/** The model's log10 multiple for a point: the fitted line, plus whichever terms the rung carries. */
export function predictLog(fit: ModelFit, p: FitPoint): number {
  let y = fit.intercept + fit.slope * Math.log10(p.tvl_usd);
  if (fit.growth !== 0) y += fit.growth * p.growth;
  if (fit.age !== 0) y += fit.age * p.age;
  return y + (fit.family.get(p.category) ?? 0);
}

/** The model's multiple for a point, clamped to the band of multiples the snapshot actually shows. */
export function predictMultiple(fit: ModelFit, p: FitPoint): number {
  const raw = 10 ** predictLog(fit, p);
  return Math.min(fit.clamp_high, Math.max(fit.clamp_low, raw));
}

/** Spearman's rank correlation, with ties broken by position: enough to say whether the order holds. */
function spearman(a: number[], b: number[]): number {
  if (a.length < 3) return 0;
  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v || x.i - y.i);
    const ranks = new Array<number>(values.length);
    order.forEach((entry, position) => {
      ranks[entry.i] = position;
    });
    return ranks;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** The error of one prediction, in log10 of the multiple: 0.48 is a factor of three. */
const missOf = (predicted: number, actual: number): number => Math.abs(predicted - actual);

const WITHIN_3X = Math.log10(3);

/**
 * Score one rung four ways, the same four for every rung:
 *
 *   loo_miss      leave one out: fit on 114 launches, predict the 115th, refit for each. The harshest
 *                 test here, because every point is scored by a model that never saw it.
 *   within_3x     the share of those held-out predictions inside a factor of three.
 *   rank_corr     Spearman between predicted and actual market cap on the held-out predictions.
 *   walk_forward  fit on the protocols listed before each cutoff, score the ones after it, pool all
 *                 three splits' absolute errors, take the median. Out of sample in time as well as in
 *                 row, which is the test a launch radar actually faces.
 */
export function scoreVariant(points: Multiple[], v: Variant, cutoffs: string[]): LadderScore {
  const fitPoints = points.map(fitPointOf);
  const fitFull = fitVariant(fitPoints, v);

  const errors: number[] = [];
  const predictedMcap: number[] = [];
  const actualMcap: number[] = [];
  for (let i = 0; i < fitPoints.length; i += 1) {
    const train = fitPoints.filter((_, j) => j !== i);
    const fit = fitVariant(train, v);
    const predicted = predictLog(fit, fitPoints[i]!);
    errors.push(missOf(predicted, fitPoints[i]!.logMultiple));
    predictedMcap.push(predicted + Math.log10(fitPoints[i]!.tvl_usd));
    actualMcap.push(fitPoints[i]!.logMultiple + Math.log10(fitPoints[i]!.tvl_usd));
  }

  const dated = points.filter((m) => m.listed_at !== null);
  const splits: ValidationSplit[] = [];
  const pooled: number[] = [];
  const pooledPredicted: number[] = [];
  const pooledActual: number[] = [];
  for (const cutoff of cutoffs) {
    const cut = Date.parse(`${cutoff}T00:00:00Z`);
    const fit = dated.filter((m) => Date.parse(`${m.listed_at!}T00:00:00Z`) < cut);
    const test = dated.filter((m) => Date.parse(`${m.listed_at!}T00:00:00Z`) >= cut);
    if (fit.length < 8 || test.length < 5) {
      splits.push({ cutoff, fit: fit.length, test: test.length, miss: 0, within_3x: 0, rank_correlation: 0 });
      continue;
    }
    const model = fitVariant(fit.map(fitPointOf), v);
    const splitErrors: number[] = [];
    const splitPredicted: number[] = [];
    const splitActual: number[] = [];
    for (const m of test) {
      const point = fitPointOf(m);
      const predicted = predictLog(model, point);
      splitErrors.push(missOf(predicted, point.logMultiple));
      splitPredicted.push(predicted + Math.log10(point.tvl_usd));
      splitActual.push(point.logMultiple + Math.log10(point.tvl_usd));
    }
    splits.push({
      cutoff,
      fit: fit.length,
      test: test.length,
      miss: 10 ** median(splitErrors),
      within_3x: splitErrors.filter((e) => e <= WITHIN_3X).length / splitErrors.length,
      rank_correlation: spearman(splitPredicted, splitActual),
    });
    pooled.push(...splitErrors);
    pooledPredicted.push(...splitPredicted);
    pooledActual.push(...splitActual);
  }

  return {
    ...v,
    fit_sample: fitFull.sample,
    loo_miss: 10 ** median(errors),
    within_3x: errors.filter((e) => e <= WITHIN_3X).length / errors.length,
    rank_correlation: spearman(predictedMcap, actualMcap),
    walk_forward: 10 ** median(pooled),
    splits,
    chosen: false,
  };
}

/**
 * The rule the page prints: the board prices with the rung whose walk-forward miss is lowest. Ties
 * go to the earlier rung, so a later term has to earn its place rather than win by rounding.
 */
export function chooseVariant(scores: LadderScore[]): LadderScore {
  let best = scores[0]!;
  for (const row of scores) if (row.walk_forward < best.walk_forward) best = row;
  return best;
}

/**
 * The residual quantiles a row's band is drawn from. For a row of this size, the nearest launches by
 * log10 TVL are the honest comparison; their residuals to the fitted model say how far a launch this
 * size lands from the curve. Returns log10 offsets, so 10^p10 multiplies the point estimate.
 */
export function residualBand(
  fit: ModelFit,
  fitPoints: FitPoint[],
  looResiduals: number[],
  tvl: number,
  bandwidth: number,
): { p10: number; p25: number; p75: number; p90: number } {
  const target = Math.log10(Math.max(tvl, 1));
  const weighted = fitPoints
    .map((p, i) => {
      const distance = Math.log10(p.tvl_usd) - target;
      return { residual: looResiduals[i]!, weight: Math.exp(-0.5 * (distance / bandwidth) ** 2), index: i };
    })
    .sort((a, b) => a.residual - b.residual || a.index - b.index);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  /** The weighted quantile: the residual at which the weight below it reaches q of the total. */
  const at = (q: number): number => {
    const goal = q * total;
    let below = 0;
    let previous = weighted[0]!;
    for (const entry of weighted) {
      const next = below + entry.weight;
      if (next >= goal) {
        const span = next - below;
        const into = span === 0 ? 0.5 : (goal - below) / span;
        return previous.residual + (entry.residual - previous.residual) * into;
      }
      below = next;
      previous = entry;
    }
    return weighted[weighted.length - 1]!.residual;
  };
  // The weighted median is subtracted before the quantiles are read. Without it the band would
  // inherit a local bias estimated from a handful of neighbours and swing above and below the point
  // estimate from one size band to the next; with it the band says how wide a miss is, which is the
  // question, and keeps the asymmetry of the residuals it was measured from.
  const centre = at(0.5);
  return { p10: at(0.1) - centre, p25: at(0.25) - centre, p75: at(0.75) - centre, p90: at(0.9) - centre };
}

/** The five size bands the page shows, and the median multiple inside each: description, not the fit. */
const BAND_FLOORS = [0, 10_000_000, 50_000_000, 200_000_000, 1_000_000_000];

export function sizeBands(multiples: Multiple[]): SizeBand[] {
  const labels = ['under $10M', '$10M to $50M', '$50M to $200M', '$200M to $1B', '$1B and up'];
  return BAND_FLOORS.map((floor, i) => {
    const ceiling = i + 1 < BAND_FLOORS.length ? BAND_FLOORS[i + 1]! : null;
    const inside = multiples.filter((m) => m.tvl_usd >= floor && (ceiling === null || m.tvl_usd < ceiling));
    return {
      label: labels[i]!,
      floor_usd: floor,
      ceiling_usd: ceiling,
      launched: inside.length,
      median_multiple: inside.length === 0 ? 0 : median(inside.map((m) => m.multiple)),
    };
  });
}

/**
 * How often a category records a token at all, pulled toward the market's rate with a pseudo-count:
 * a category with five launches and one with fifty both speak, and the small one does not shout.
 */
export function categoryOdds(protocols: SnapshotProtocol[], marketRate: number): CategoryOdds[] {
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const p of protocols) {
    const key = p.category ?? 'Uncategorised';
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [p]);
    else bucket.push(p);
  }
  return [...groups.entries()]
    .map(([key, ps]) => {
      const launched = ps.filter((p) => !isPreToken(p)).length;
      const raw = ps.length === 0 ? 0 : launched / ps.length;
      return {
        key,
        protocols: ps.length,
        launched,
        raw_rate: raw,
        odds: (launched + MODEL.shrink_odds * marketRate) / (ps.length + MODEL.shrink_odds),
      };
    })
    .sort((a, b) => b.protocols - a.protocols || (a.key < b.key ? -1 : 1));
}

/** A whole number of dollars, as a step's cost reads: $12, $0.60, $1,200. */
function usd(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  if (n >= 10) return `$${Math.round(n)}`;
  return `$${n.toFixed(2).replace(/\.?0+$/, '')}`;
}

/** A figure as a reader says it: $2.76B, $105.6M, $840K. */
export function usdCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

/** The chain a plan is written for: the first one the protocol names, or a neutral phrase. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The assumed gas for a chain, from the table the page prints. */
export function gasFor(chains: string[]): number {
  for (const chain of chains) {
    const known = ASSUMPTIONS.gas_usd.find((g) => g.chain === chain);
    if (known !== undefined) return known.usd;
  }
  return ASSUMPTIONS.gas_default_usd;
}

/** How long to hold before judging the farm, from the protocol's age: young protocols need a longer window. */
export function holdDaysFor(age: number | null): number {
  const days = age ?? MODEL.neutral_age_days;
  for (const tier of ASSUMPTIONS.hold_days) if (days >= tier.age_floor) return tier.days;
  return ASSUMPTIONS.hold_days[ASSUMPTIONS.hold_days.length - 1]!.days;
}

/** The hours a plan takes: opening it, closing it, and a weekly look for the length of the hold. */
export function hoursFor(hold: number): number {
  return (
    ASSUMPTIONS.setup_hours +
    ASSUMPTIONS.exit_hours +
    (hold / 7) * ASSUMPTIONS.review_hours_per_week
  );
}

/**
 * What a farmer actually does with this kind of protocol. The action follows the category, not the
 * name: two lending markets are farmed the same way, and a category the table does not know falls
 * through to the generic instruction rather than being guessed at.
 */
const ACTIONS: { match: RegExp; action: (name: string, chain: string, capital: number) => string }[] = [
  {
    // Before lending: a CDP's own product is the debt it issues, not a pool it lends from.
    match: /cdp|stablecoin|wrapper/i,
    action: (n, c, k) => `Mint ${usd(k)} against collateral through ${n} on ${c} and hold the debt open`,
  },
  {
    match: /lend|collateral/i,
    action: (n, c, k) => `Supply ${usd(k)} of USDC to ${n} on ${c} and keep the position open through a full epoch`,
  },
  {
    match: /dex|liquidity manager|leveraged farming/i,
    action: (n, c, k) => `Provide ${usd(k)} of liquidity to ${n}'s deepest pool on ${c} and leave it in range`,
  },
  {
    match: /yield|farm|indexes/i,
    action: (n, c, k) => `Deposit ${usd(k)} of USDC into ${n}'s flagship vault on ${c} and leave it compounding`,
  },
  {
    match: /rwa|otc/i,
    action: (n, c, k) => `Mint or hold ${usd(k)} of ${n}'s yield-bearing receipt on ${c} and keep it on chain`,
  },
  {
    // A payment network is farmed by moving volume through it, not by holding a receipt.
    match: /payment/i,
    action: (n, c, k) => `Route about ${usd(k)} of volume through ${n} on ${c} over a month and keep the wallet active`,
  },
  {
    match: /prediction/i,
    action: (n, c, k) => `Trade ${usd(k)} across two of ${n}'s markets on ${c}, both sides, and keep the account active`,
  },
  {
    match: /risk curator|capital allocator/i,
    action: (n, c, k) => `Deposit ${usd(k)} into a vault curated by ${n} on ${c} and keep it there across a quarter`,
  },
  {
    // A chain's own name stands in for the chain: "on Hive Protocol on Hive Protocol" reads as a bug.
    match: /chain/i,
    action: (n, c, k) => `Bridge ${usd(k)} onto ${n} and use its own apps there rather than a side branch`,
  },
  {
    match: /basis|derivative|synthetic/i,
    action: (n, c, k) => `Open a ${usd(k)} delta-neutral basis through ${n} on ${c} and roll it weekly`,
  },
  {
    match: /restak|staking pool|anchor/i,
    action: (n, c, k) => `Restake ${usd(k)} through ${n} on ${c} and leave the receipt in the same wallet`,
  },
];

/** The action sentence for a protocol: category first, then a generic instruction that is still true. */
export function actionFor(p: SnapshotProtocol, capital: number): string {
  const chain = primaryChain(p);
  const known = ACTIONS.find((a) => a.match.test(p.category ?? ''));
  if (known !== undefined) return `${known.action(p.name, chain, capital)}.`;
  return `Use ${p.name} on ${chain} with ${usd(capital)} and keep the position open; no category-specific route is assumed.`;
}

/** The reference position the written plan uses: the page's smallest stake, and it says so. */
const PLAN_STAKE = ASSUMPTIONS.stake_tiers[0];

/**
 * The farm plan for one protocol: five steps that name the action, the money, the time and the way
 * out. Every figure comes from the protocol's own record or from the printed assumption table, and
 * every step ends with its cost and its clock, because a plan without those is a slogan. The
 * position size is the page's reference stake; the decision block prices any of the four.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, decision: Decision): FarmStep[] {
  const chain = primaryChain(p);
  const gas = gasFor(p.chains);
  const hold = holdDaysFor(age);
  const tvl = p.tvl_usd;
  const growth = p.change_7d;
  const growthText =
    growth === null ? 'no seven-day change is reported' : `TVL moved ${growth > 0 ? '+' : ''}${growth}% in seven days`;
  const ageText = age === null ? 'with no listed date' : `tracked since ${p.listed_at}, ${age} days`;
  const chainsText = p.chains.length === 0 ? 'its main chain' : `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}`;
  const exitDays = hold * 2;
  const verdict =
    decision.net_usd > 0
      ? `At ${usd(PLAN_STAKE)} the risk-weighted net is ${usd(decision.net_usd)}`
      : `At ${usd(PLAN_STAKE)} the plan does not cover its own cost`;
  return [
    {
      text: `${actionFor(p, PLAN_STAKE)} ${p.name} holds ${usdCompact(tvl)} of TVL across ${chainsText} and its DefiLlama record carries no token, ${ageText}.`,
      cost: `${usd(PLAN_STAKE)} capital`,
      time: 'same day',
    },
    {
      text: `Fund the wallet on ${chain} and open the position in one sitting; ${growthText}, which sets whether this is a first tranche or a full one.`,
      cost: `${usd(gas)} gas`,
      time: 'about 30 min',
    },
    {
      text: `Hold for ${hold} days before judging it. Airdrop snapshots cover weeks of activity, and a position closed in a week reads as a wallet farming a signature, not as a user.`,
      cost: `${usd(gas * ASSUMPTIONS.gas_trips + (PLAN_STAKE * ASSUMPTIONS.capital_cost_apr * hold) / 365)} all-in`,
      time: `${hold} days`,
    },
    {
      text: `Watch TVL against today's ${usdCompact(tvl)}: add a second tranche if it holds 30 days above that line, and stop adding if it falls more than 25% below it, because a leaking pool is a launch that is not coming. ${verdict}.`,
      cost: `${usd(PLAN_STAKE)} more if it holds`,
      time: 'review weekly',
    },
    {
      text: `Set the exit before entering: withdraw after ${exitDays} days if no token is recorded, and if one is announced, claim only from ${p.name}'s own site, never from a link sent to you.`,
      cost: `${usd(gas)} to exit or claim`,
      time: `${exitDays} days`,
    },
  ];
}

/** A step as the one string board.json carries: the action, then its cost and its clock. */
export function stepText(step: FarmStep): string {
  const text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length <= 600) return text;
  return `${text.slice(0, 596)}...`;
}

const round = (n: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
};

/**
 * The decision at one stake. Every number is arithmetic on the row's own figures and the printed
 * assumptions, and the verdict is the only judgement in it:
 *
 *   slice      your stake as a share of the pool the launch pays, times that pool's share of the value
 *   net        slice × the category's launch odds, less two transactions' gas and the cost of capital
 *   break-even how far above the model the launch must land, after the odds, for the bet to pay
 *   net/hour   net over the hours the plan takes, measured against what an hour is worth
 *
 * Break-even is on the same basis as net, deliberately: a row that says "pays at 0.5x the model" and
 * then says Skip would be two different questions in adjacent columns. The all-or-nothing slice is in
 * the column beside it, and the launch-if-it-happens arithmetic is in `net_if_launch_usd`.
 *
 * A farm that loses money on its own cost is Skip however large its implied value is; that is the
 * whole point of putting this column beside the ranking.
 */
export function decide(ifl: number, implied: number, tvl: number, oddsValue: number, age: number | null, chains: string[], stake: number): Decision {
  const share = stake / (tvl + stake);
  const pool = ASSUMPTIONS.pool_share;
  const slice = share * pool * ifl;
  const weighted = share * pool * implied;
  const hold = holdDaysFor(age);
  const hours = hoursFor(hold);
  const cost = gasFor(chains) * ASSUMPTIONS.gas_trips + (stake * ASSUMPTIONS.capital_cost_apr * hold) / 365;
  const netIfLaunch = slice - cost;
  const net = weighted - cost;
  const netPerHour = net / hours;
  const breakEven = weighted > 0 ? cost / weighted : Number.POSITIVE_INFINITY;
  const breakEvenPool = implied > 0 ? cost / (share * implied) : Number.POSITIVE_INFINITY;
  const verdict: Decision['verdict'] = net <= 0 ? 'Skip' : netPerHour >= ASSUMPTIONS.labour_usd_per_hour ? 'Worth farming' : 'Marginal';
  return {
    stake,
    slice_usd: round(slice, 2),
    net_if_launch_usd: round(netIfLaunch, 2),
    net_usd: round(net, 2),
    break_even: round(Math.min(breakEven, 99), 3),
    break_even_pool: round(Math.min(breakEvenPool, 99), 4),
    cost_usd: round(cost, 2),
    hours: round(hours, 2),
    net_per_hour: round(netPerHour, 2),
    verdict,
  };
}

/** One protocol's figures under the model, with every intermediate number kept so the page can show its work. */
export interface Scored {
  protocol: SnapshotProtocol;
  category: string;
  age: number | null;
  sizeMultiple: number;
  familyOffset: number;
  growthMultiplier: number;
  multiple: number;
  odds: number;
  valueIfLaunched: number;
  implied: number;
  band: { p10: number; p25: number; p75: number; p90: number };
  decisions: Decision[];
}

/** The fit point of a protocol that records no token: the row the model prices. */
function candidatePoint(p: SnapshotProtocol, asOf: string): FitPoint {
  return {
    category: p.category ?? 'Uncategorised',
    tvl_usd: p.tvl_usd,
    logMultiple: 0,
    growth: growthTerm(p.change_7d),
    age: ageTerm(ageDays(asOf, p.listed_at)),
  };
}

/**
 * Build the whole radar: the ladder, the winning rung, the band it leaves, the ranked board and the
 * page's payload. The board holds every launch candidate, sorted by implied value, with the watchlist
 * guaranteed a place even where a protocol's own score would put it below the cut.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  if (!Array.isArray(snapshot.protocols) || snapshot.protocols.length === 0) {
    throw new SnapshotError('the snapshot carries no protocols');
  }
  const multiples = multiplesOf(snapshot.protocols, snapshot.as_of);
  const fitPoints = multiples.map(fitPointOf);
  const launched = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const marketRate = launched / snapshot.protocols.length;
  const oddsTable = categoryOdds(snapshot.protocols, marketRate);
  const odds = new Map(oddsTable.map((o) => [o.key, o.odds]));

  const cutoffs = ['2024-01-01', '2024-07-01', '2025-01-01'];
  const ladder = LADDER.map((v) => scoreVariant(multiples, v, cutoffs));
  const winner = chooseVariant(ladder);
  for (const row of ladder) row.chosen = row.key === winner.key;
  const variant = LADDER.find((v) => v.key === winner.key)!;
  const fit = fitVariant(fitPoints, variant);

  // The band a row is drawn with is the spread of the fitted model's leave-one-out misses, read in a
  // window around its TVL: a launch this size lands this far from the curve, and the window keeps the
  // claim local instead of quoting one number for a $5M protocol and a $2B one.
  const looResiduals = fitPoints.map((p, i) => {
    const train = fitPoints.filter((_, j) => j !== i);
    return p.logMultiple - predictLog(fitVariant(train, variant), p);
  });
  const globalBand = residualBand(fit, fitPoints, looResiduals, median(fitPoints.map((p) => p.tvl_usd)), fitPoints.length);

  const scored: Scored[] = [];
  for (const p of snapshot.protocols) {
    if (!isLaunchCandidate(p)) continue;
    scored.push(scoreCandidate(p, snapshot.as_of, fit, odds, fitPoints, looResiduals));
  }
  // The watchlist is the floor of the board's coverage, never a ceiling on its ambition: every
  // rankable protocol is ranked, and the gate's coverage row is satisfied by construction.
  const chosen = new Set(scored.map((s) => s.protocol.slug));
  for (const slug of snapshot.watchlist) {
    if (chosen.has(slug)) continue;
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p !== undefined) scored.push(scoreCandidate(p, snapshot.as_of, fit, odds, fitPoints, looResiduals));
  }
  scored.sort((a, b) => b.implied - a.implied || (a.protocol.slug < b.protocol.slug ? -1 : 1));
  if (scored.length < BOARD_MIN_ROWS) {
    throw new SnapshotError(`only ${scored.length} protocols can be ranked, and a board needs ${BOARD_MIN_ROWS}`);
  }

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.protocol.slug,
    name: s.protocol.name,
    category: s.protocol.category,
    chains: s.protocol.chains,
    tvl_usd: s.protocol.tvl_usd,
    change_7d: s.protocol.change_7d,
    mcap_usd: s.protocol.mcap_usd,
    listed_at: s.protocol.listed_at,
    gecko_id: s.protocol.gecko_id,
    symbol: s.protocol.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      version: MODEL_VERSION,
      size_multiple: round(s.sizeMultiple, 4),
      family_offset: round(s.familyOffset, 4),
      growth_multiplier: round(s.growthMultiplier, 4),
      launch_odds: round(s.odds, 4),
      value_if_launched_usd: Math.round(s.valueIfLaunched),
      band_p10_usd: Math.round(s.band.p10),
      band_p90_usd: Math.round(s.band.p90),
    },
    decision: s.decisions[0]!,
    farm_steps: farmPlan(s.protocol, s.age, s.decisions[0]!).map(stepText),
  }));

  const watchlist = new Set(snapshot.watchlist);
  const rows: RadarRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.protocol.slug,
    name: s.protocol.name,
    cat: s.category,
    chains: s.protocol.chains,
    tvl: s.protocol.tvl_usd,
    ch: s.protocol.change_7d,
    listed: s.protocol.listed_at,
    age: s.age,
    sz: round(s.sizeMultiple, 4),
    mult: round(s.multiple, 4),
    odds: round(s.odds, 4),
    mo: round(s.growthMultiplier, 4),
    fam: round(s.familyOffset, 4),
    ifl: Math.round(s.valueIfLaunched),
    implied: s.implied,
    band: [s.band.p10, s.band.p25, s.band.p75, s.band.p90].map((v) => Math.round(v)) as [number, number, number, number],
    hold: holdDaysFor(s.age),
    gas: gasFor(s.protocol.chains),
    hours: round(hoursFor(holdDaysFor(s.age)), 2),
    watch: watchlist.has(s.protocol.slug),
    farm: farmPlan(s.protocol, s.age, s.decisions[0]!),
    dec: s.decisions,
  }));

  const family = [...fit.family.entries()]
    .map(([key, offset]) => ({ key, offset: round(offset, 4), launched: multiples.filter((m) => m.category === key).length }))
    .sort((a, b) => b.launched - a.launched || (a.key < b.key ? -1 : 1));

  const scatter: ScatterPoint[] = [];
  for (const m of multiples) scatter.push({ slug: m.slug, name: m.name, tvl: m.tvl_usd, value: m.mcap_usd, kind: 0 });
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (multiples.some((m) => m.slug === p.slug)) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    scatter.push({ slug: p.slug, name: p.name, tvl: p.tvl_usd, value: p.mcap_usd, kind: 1 });
  }
  for (const s of scored) {
    scatter.push({
      slug: s.protocol.slug,
      name: s.protocol.name,
      tvl: s.protocol.tvl_usd,
      value: Math.round(s.valueIfLaunched),
      kind: watchlist.has(s.protocol.slug) ? 3 : 2,
    });
  }
  scatter.sort((a, b) => a.kind - b.kind || (a.slug < b.slug ? -1 : 1));

  // The band the scatter draws. Sampled on a fixed log grid rather than per row, so the page has one
  // path to render and the numbers behind it are the same window the rows use. A grid point above the
  // largest protocol is clamped, never extrapolated.
  const tvlValues = [...multiples.map((m) => m.tvl_usd), ...scored.map((s) => s.protocol.tvl_usd)];
  const tvlMin = Math.min(...tvlValues);
  const tvlMax = Math.max(...tvlValues);
  const bandCurve = Array.from({ length: 21 }, (_, i) => {
    const tvl = 10 ** (Math.log10(tvlMin) + ((Math.log10(tvlMax) - Math.log10(tvlMin)) * i) / 20);
    const point: FitPoint = { category: '', tvl_usd: tvl, logMultiple: 0, growth: 0, age: 0 };
    const mult = predictMultiple(fit, point);
    const b = residualBand(fit, fitPoints, looResiduals, tvl, MODEL.band_bandwidth);
    return { tvl: Math.round(tvl), mult: round(mult, 4), lo: round(mult * 10 ** b.p25, 4), hi: round(mult * 10 ** b.p75, 4) };
  });

  const radar: RadarData = {
    meta: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION,
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      watchlist_covered: scored.filter((s) => watchlist.has(s.protocol.slug)).length,
      pre_token: snapshot.protocols.filter(isPreToken).length,
      ranked: board.length,
    },
    model: MODEL,
    assumptions: ASSUMPTIONS,
    market: {
      protocols: snapshot.protocols.length,
      launched,
      launch_rate: marketRate,
      median_multiple: median(multiples.map((m) => m.multiple)),
      multiples: multiples.length,
    },
    curve: {
      variant: fit.variant,
      intercept: round(fit.intercept, 4),
      slope: round(fit.slope, 4),
      growth: round(fit.growth, 4),
      sample: fit.sample,
      residual_sd: round(fit.residual_sd, 3),
      clamp_low: round(fit.clamp_low, 3),
      clamp_high: round(fit.clamp_high, 3),
      family,
    },
    bands: sizeBands(multiples),
    odds: oddsTable,
    ladder: ladder.map((row) => ({
      name: row.label,
      loo: round(row.loo_miss, 2),
      withinThree: round(row.within_3x, 3),
      rho: round(row.rank_correlation, 2),
      walkForward: round(row.walk_forward, 2),
      chosen: row.chosen,
    })),
    splits: ladder.find((row) => row.chosen)!.splits,
    residual: {
      p10: round(globalBand.p10, 3),
      p25: round(globalBand.p25, 3),
      p75: round(globalBand.p75, 3),
      p90: round(globalBand.p90, 3),
    },
    band_curve: bandCurve,
    rows,
    live: multiples,
    scatter,
  };
  return { board, radar };
}

/** Price one protocol that records no token: the model, its band, and its decision at every stake. */
function scoreCandidate(
  p: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
  odds: Map<string, number>,
  fitPoints: FitPoint[],
  looResiduals: number[],
): Scored {
  const age = ageDays(asOf, p.listed_at);
  const point = candidatePoint(p, asOf);
  const category = point.category;
  const familyOffset = fit.family.get(category) ?? 0;
  const sizeMultiple = 10 ** (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
  const growthMultiplier = 10 ** (fit.growth * point.growth);
  const multiple = predictMultiple(fit, point);
  const oddsValue = odds.get(category) ?? 0.5;
  const valueIfLaunched = p.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(valueIfLaunched * oddsValue));
  const bandLog = residualBand(fit, fitPoints, looResiduals, p.tvl_usd, MODEL.band_bandwidth);
  const decisions = ASSUMPTIONS.stake_tiers.map((stake) =>
    decide(valueIfLaunched, valueIfLaunched * oddsValue, p.tvl_usd, oddsValue, age, p.chains, stake),
  );
  return {
    protocol: p,
    category,
    age,
    sizeMultiple,
    familyOffset,
    growthMultiplier,
    multiple,
    odds: oddsValue,
    valueIfLaunched,
    implied,
    band: {
      p10: Math.min(valueIfLaunched * oddsValue, valueIfLaunched * 10 ** bandLog.p10 * oddsValue),
      p25: Math.min(valueIfLaunched * oddsValue, valueIfLaunched * 10 ** bandLog.p25 * oddsValue),
      p75: Math.max(valueIfLaunched * oddsValue, valueIfLaunched * 10 ** bandLog.p75 * oddsValue),
      p90: Math.max(valueIfLaunched * oddsValue, valueIfLaunched * 10 ** bandLog.p90 * oddsValue),
    },
    decisions,
  };
}

/** Why a board would be refused, or null when it passes the gate's data rows. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < BOARD_MIN_ROWS) return `only ${board.length} rows, and a board needs ${BOARD_MIN_ROWS}`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const ranks = new Set<number>();
  let previous = Number.POSITIVE_INFINITY;
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row ${row.rank} names a slug the snapshot does not carry: ${row.slug}`;
    if (seen.has(row.slug)) return `row ${row.rank} repeats a slug: ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1) return `row ${row.slug} has no whole rank`;
    if (ranks.has(row.rank)) return `rank ${row.rank} appears twice`;
    ranks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      return `row ${row.rank} has no whole implied value`;
    }
    if (row.implied_value_usd > previous) return `row ${row.rank} is worth more than the row above it`;
    previous = row.implied_value_usd;
    if (!(row.model.band_p10_usd <= row.implied_value_usd && row.implied_value_usd <= row.model.band_p90_usd)) {
      return `row ${row.rank} sits outside its own band`;
    }
    if (row.decision.verdict !== 'Worth farming' && row.decision.verdict !== 'Marginal' && row.decision.verdict !== 'Skip') {
      return `row ${row.rank} has no verdict`;
    }
    if (!Number.isFinite(row.decision.net_usd) || !Number.isFinite(row.decision.net_per_hour)) {
      return `row ${row.rank} has a decision that is not a number`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `row ${row.rank} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `row ${row.rank} has a ${trimmed.length}-character step`;
    }
  }
  if (ranks.size !== board.length) return 'the ranks are not 1..N';
  for (const slug of snapshot.watchlist) if (!seen.has(slug)) return `the watchlist slug ${slug} is not on the board`;
  return null;
}

/** The page's data, as the one script tag the dashboard reads. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
