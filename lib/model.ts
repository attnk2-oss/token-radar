// The token radar's model: one sealed snapshot in, one ranked board out.
//
// The question is narrow. A protocol has TVL, a seven-day TVL change and a date DefiLlama started
// tracking it, and it records no token. What would that token be worth today, how likely is one at
// all, and what should a reader do about it before it exists?
//
// Three models were tried against this snapshot, and the page prints the test rather than the claim:
//
//   1. One market-wide multiple (tvl x 0.25). The starter's model. Measured on the snapshot's own
//      token-bearing protocols, mcap/TVL ranges from 0.02 to 3.0, so one number is wrong by an order
//      of magnitude for most of the field.
//
//   2. A multiple per category, fitted on each category's own launched protocols. It looks sharper,
//      and it is not: fitted on protocols listed before a date and tested on the ones listed after
//      it, its median miss is 1.29 in log space against 1.30 for the flat multiple. Category tells
//      you almost nothing about what a token trades at once the protocol is big enough to be here.
//
//   3. The curve this model uses: mcap/TVL falls with TVL. Fit in log space, a $5M protocol trades
//      at about 0.6x its TVL and a $2B one at about 0.06x. Tested the same way, its median miss is
//      1.04 against 1.30 for the flat multiple, and 40% of held-out launches land within 2x against
//      29%. That is the one difference here that survives out of sample, so it is the one the board
//      prices on.
//
// So:
//
//   implied = tvl_usd x multiple(tvl_usd) x launch_odds(category) x momentum(d7d) x maturity(age)
//
// where multiple() is the fitted size curve, launch_odds() is how often that category records a
// token at all, and momentum and maturity are the two adjustments a reader would ask for anyway.
// Every constant is exported, printed on the page, and re-derivable from the snapshot. No protocol
// name is special-cased anywhere: the same functions score all 198 rankable protocols.
//
// Two more decisions a reader will notice:
//
//   * Structural exclusions. The watchlist's own rule (input/README.md) drops exchanges, bridges,
//     liquid staking and wrapped or staked products of a token that already trades, because those are
//     not protocols waiting on a launch. That rule is applied to the whole field, not just to
//     protocols above the $50M floor: the floor moves, the rule does not. Without it the board's top
//     rows are Bybit, WBTC and Coinbase Bridge, and the radar answers a different question.
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

/** Every constant the model runs on, exported so the page can print them and a reader can redo the sum. */
export interface ModelConstants {
  /** How far a week of TVL growth can move a value, as a share of the value. */
  momentum_weight: number;
  /** The TVL change, in per cent, at which momentum has done about three quarters of its work. */
  momentum_scale_pct: number;
  /** Momentum input is clamped here: an eight-figure jump in seven days is noise, not a forecast. */
  growth_floor_pct: number;
  growth_cap_pct: number;
  /** The slope the size curve is allowed to take: never up, never steeper than this. */
  slope_floor: number;
  slope_cap: number;
  /** The curve's output is clamped to this band of the multiples the snapshot itself shows. */
  clamp_quantile_low: number;
  clamp_quantile_high: number;
  /** Pseudo-count of protocols pulling a category's launch odds to the market's. */
  shrink_odds: number;
  /** A protocol younger than this has not proved it can keep TVL; older than the second, it has had its chance. */
  young_days: number;
  old_days: number;
  young_floor: number;
  old_floor: number;
  old_decay_per_year: number;
  unknown_age_multiplier: number;
  /** Ratios outside this band are not market prices, they are data errors or dust. */
  ratio_floor: number;
  ratio_cap: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.35,
  momentum_scale_pct: 30,
  growth_floor_pct: -60,
  growth_cap_pct: 150,
  slope_floor: -0.7,
  slope_cap: 0,
  clamp_quantile_low: 0.05,
  clamp_quantile_high: 0.95,
  shrink_odds: 6,
  young_days: 180,
  old_days: 1825,
  young_floor: 0.88,
  old_floor: 0.7,
  old_decay_per_year: 0.03,
  unknown_age_multiplier: 0.92,
  ratio_floor: 0.01,
  ratio_cap: 20,
};

/** The model's version label, printed on the page and named in the method block. */
export const MODEL_VERSION = 'radar-3';

/** How the board is drawn: every rankable protocol, and never fewer than the gate's floor of 100. */
export const BOARD_MIN_ROWS = 100;

/** One launched protocol's multiple: the market's own answer, and the raw material of the curve. */
export interface Multiple {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
  listed_at: string | null;
}

/** The fitted size curve: mcap/TVL as a straight line in log10 space, clamped to what was observed. */
export interface SizeCurve {
  /** log10(multiple) = intercept + slope * log10(tvl) */
  intercept: number;
  slope: number;
  /** The clamp: the low and high quantiles of the multiples the curve was fitted on. */
  clamp_low: number;
  clamp_high: number;
  /** How many protocols the fit used. */
  sample: number;
  /** The residual spread of the fit, in log10: 10^residual_sd is the typical factor of a miss. */
  residual_sd: number;
}

/** One size band, for the page's table: how the field actually prices itself by size. */
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

/** One out-of-sample test: fit the model on protocols listed before the cutoff, score the rest. */
export interface Validation {
  cutoff: string;
  fit: number;
  test: number;
  /** Median absolute error in natural log, and the factor a reader can feel. */
  curve_error: number;
  curve_factor: number;
  flat_error: number;
  flat_factor: number;
  /** Share of held-out launches the model lands within 2x of. */
  curve_within_2x: number;
  flat_within_2x: number;
  /** Spearman rank correlation of predicted market cap against actual, on the held-out set. */
  rank_correlation: number;
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A ranked row as board.json carries it: the gate reads these fields and nothing else. */
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
    launch_odds: number;
    momentum: number;
    maturity: number;
    value_if_launched_usd: number;
  };
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
  mult: number;
  odds: number;
  mo: number;
  ma: number;
  ifl: number;
  implied: number;
  /** Whether the house's own watchlist names this protocol: the coverage the gate checks, visible. */
  watch: boolean;
  farm: FarmStep[];
}

/** Everything the page needs: the board, the curve behind it, the odds table and the test. */
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
  model: ModelConstants;
  assumptions: Assumptions;
  market: { protocols: number; launched: number; launch_rate: number; median_multiple: number; multiples: number };
  curve: SizeCurve;
  bands: SizeBand[];
  odds: CategoryOdds[];
  validation: Validation[];
  rows: RadarRow[];
  live: Multiple[];
}

/** The farm plan's stated costs, printed on the page: an assumption a reader can argue with. */
export interface Assumptions {
  gas_usd: { chain: string; usd: number }[];
  gas_default_usd: number;
  capital_usd: { tvl_floor: number; usd: number }[];
  hold_days: { age_floor: number; days: number }[];
}

export const ASSUMPTIONS: Assumptions = {
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
  capital_usd: [
    { tvl_floor: 5_000_000_000, usd: 300 },
    { tvl_floor: 1_000_000_000, usd: 200 },
    { tvl_floor: 250_000_000, usd: 150 },
    { tvl_floor: 50_000_000, usd: 100 },
    { tvl_floor: 0, usd: 60 },
  ],
  hold_days: [
    { age_floor: 730, days: 30 },
    { age_floor: 365, days: 40 },
    { age_floor: 180, days: 45 },
    { age_floor: 0, days: 60 },
  ],
};

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
 * Whether a protocol is a launch candidate at all: the watchlist's structural rule from
 * input/README.md, applied to the whole field rather than to the protocols above its $50M floor.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (DERIVATIVE_NAME.test(p.name)) return false;
  return !EXCHANGE_PREFIX.some((prefix) => p.name.startsWith(prefix));
}

/** A whole day count from listed_at to the snapshot's date; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol's market cap over its TVL, when both are usable: the ratio the whole model is built on. */
function ratioOf(p: SnapshotProtocol): number | null {
  if (p.tvl_usd <= 0) return null;
  const mcap = p.mcap_usd;
  if (mcap === null || mcap <= 0) return null;
  const ratio = mcap / p.tvl_usd;
  return ratio >= MODEL.ratio_floor && ratio <= MODEL.ratio_cap ? ratio : null;
}

/** Every launched protocol with a usable ratio, largest multiple first: the curve's raw material. */
export function multiplesOf(protocols: SnapshotProtocol[]): Multiple[] {
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
const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
};

/**
 * Fit log10(mcap/TVL) against log10(TVL) by ordinary least squares. The slope is clamped to
 * [-0.7, 0]: the measurement says a protocol ten times larger trades at roughly a quarter of the
 * multiple, and a positive slope on this sample is noise, not a market.
 */
export function fitCurve(multiples: Multiple[]): SizeCurve {
  const xs = multiples.map((m) => Math.log10(m.tvl_usd));
  const ys = multiples.map((m) => Math.log10(m.multiple));
  const n = xs.length;
  if (n < 3) throw new SnapshotError('the snapshot carries too few launched protocols to fit a curve');
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let cov = 0;
  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    variance += (xs[i]! - mx) ** 2;
  }
  const rawSlope = variance === 0 ? 0 : cov / variance;
  const slope = Math.min(MODEL.slope_cap, Math.max(MODEL.slope_floor, rawSlope));
  const intercept = my - slope * mx;
  let squares = 0;
  for (let i = 0; i < n; i += 1) squares += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  const observed = ys.map((y) => 10 ** y).sort((a, b) => a - b);
  return {
    intercept,
    slope,
    clamp_low: quantile(observed, MODEL.clamp_quantile_low),
    clamp_high: quantile(observed, MODEL.clamp_quantile_high),
    sample: n,
    residual_sd: Math.sqrt(squares / n),
  };
}

/** The curve's multiple for a protocol of this TVL: the fitted line, clamped to what was observed. */
export function curveMultiple(curve: SizeCurve, tvl: number): number {
  const raw = 10 ** (curve.intercept + curve.slope * Math.log10(Math.max(tvl, 1)));
  return Math.min(curve.clamp_high, Math.max(curve.clamp_low, raw));
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
    .sort((a, b) => b.protocols - a.protocols);
}

/** Spearman's rank correlation, with ties broken by position: enough to say whether the order holds. */
function spearman(a: number[], b: number[]): number {
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

/**
 * The out-of-sample test, run on the snapshot itself: fit the curve on the protocols listed before a
 * cutoff, then score the ones listed after it against their actual market cap. The flat-multiple
 * baseline is fitted on the same earlier half, so the comparison is like for like.
 */
export function validate(multiples: Multiple[], cutoffs: string[]): Validation[] {
  const dated = multiples.filter((m) => m.listed_at !== null);
  return cutoffs.map((cutoff) => {
    const cut = Date.parse(`${cutoff}T00:00:00Z`);
    const fit = dated.filter((m) => Date.parse(`${m.listed_at!}T00:00:00Z`) < cut);
    const test = dated.filter((m) => Date.parse(`${m.listed_at!}T00:00:00Z`) >= cut);
    const empty: Validation = {
      cutoff,
      fit: fit.length,
      test: test.length,
      curve_error: 0,
      curve_factor: 1,
      flat_error: 0,
      flat_factor: 1,
      curve_within_2x: 0,
      flat_within_2x: 0,
      rank_correlation: 0,
    };
    if (fit.length < 8 || test.length < 5) return empty;
    const curve = fitCurve(fit);
    const flat = 10 ** (fit.reduce((s, m) => s + Math.log10(m.multiple), 0) / fit.length);
    const curveErrors: number[] = [];
    const flatErrors: number[] = [];
    let curveInside = 0;
    let flatInside = 0;
    const predicted: number[] = [];
    const actual: number[] = [];
    for (const m of test) {
      const curveError = Math.abs(Math.log(curveMultiple(curve, m.tvl_usd) / m.multiple));
      const flatError = Math.abs(Math.log(flat / m.multiple));
      curveErrors.push(curveError);
      flatErrors.push(flatError);
      if (curveError <= Math.LN2) curveInside += 1;
      if (flatError <= Math.LN2) flatInside += 1;
      predicted.push(curveMultiple(curve, m.tvl_usd) * m.tvl_usd);
      actual.push(m.mcap_usd);
    }
    return {
      cutoff,
      fit: fit.length,
      test: test.length,
      curve_error: median(curveErrors),
      curve_factor: Math.exp(median(curveErrors)),
      flat_error: median(flatErrors),
      flat_factor: Math.exp(median(flatErrors)),
      curve_within_2x: curveInside / test.length,
      flat_within_2x: flatInside / test.length,
      rank_correlation: spearman(predicted, actual),
    };
  });
}

/**
 * Momentum: how a week of TVL growth moves the value. tanh keeps it honest at both ends, so a
 * protocol that doubled in a week is worth at most 1.35x its base and one that halved is worth at
 * least 0.65x. A missing change is neutral, not zero.
 */
export function momentum(change7d: number | null): number {
  const change = finite(change7d, 0);
  const clamped = Math.min(MODEL.growth_cap_pct, Math.max(MODEL.growth_floor_pct, change));
  return 1 + MODEL.momentum_weight * Math.tanh(clamped / MODEL.momentum_scale_pct);
}

/**
 * Maturity: age stands in for the two things the snapshot cannot show. A protocol a few months old
 * has not proved it can hold TVL through a bad month, so it is discounted a little. A protocol that
 * has run six years with no token has had its chance, so it is discounted more, 3% a year to a floor
 * of 0.7. The band in between is the model's full value.
 */
export function maturity(age: number | null): number {
  if (age === null) return MODEL.unknown_age_multiplier;
  if (age < MODEL.young_days) return MODEL.young_floor + (1 - MODEL.young_floor) * (age / MODEL.young_days);
  if (age > MODEL.old_days) {
    const yearsOver = (age - MODEL.old_days) / 365;
    return Math.max(MODEL.old_floor, 1 - MODEL.old_decay_per_year * yearsOver);
  }
  return 1;
}

/** One protocol's figures under the model, with every intermediate number kept so the page can show its work. */
export interface Scored {
  protocol: SnapshotProtocol;
  category: string;
  age: number | null;
  multiple: number;
  odds: number;
  momentum: number;
  maturity: number;
  value_if_launched: number;
  implied_value: number;
}

/** Score one pre-token protocol against the curve and its category's launch odds. */
export function score(
  protocol: SnapshotProtocol,
  curve: SizeCurve,
  odds: Map<string, number>,
  asOf: string,
): Scored {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = curveMultiple(curve, protocol.tvl_usd);
  const launchOdds = odds.get(protocol.category ?? 'Uncategorised') ?? 0.5;
  const mo = momentum(protocol.change_7d);
  const ma = maturity(age);
  const valueIfLaunched = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds * mo * ma));
  return {
    protocol,
    category: protocol.category ?? 'Uncategorised',
    age,
    multiple,
    odds: launchOdds,
    momentum: mo,
    maturity: ma,
    value_if_launched: valueIfLaunched,
    implied_value: implied,
  };
}

/** A whole number of dollars, as a step's cost reads: $12, $0.60, $1,200. */
function usd(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
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
function gasFor(chain: string): number {
  const known = ASSUMPTIONS.gas_usd.find((g) => g.chain === chain);
  return known === undefined ? ASSUMPTIONS.gas_default_usd : known.usd;
}

/** The capital one qualifying position needs, from the protocol's own size. */
export function capitalFor(tvl: number): number {
  for (const tier of ASSUMPTIONS.capital_usd) if (tvl >= tier.tvl_floor) return tier.usd;
  return ASSUMPTIONS.capital_usd[ASSUMPTIONS.capital_usd.length - 1]!.usd;
}

/** How long to hold before judging the farm, from the protocol's age: young protocols need a longer window. */
export function holdDaysFor(age: number | null): number {
  const days = age ?? 365;
  for (const tier of ASSUMPTIONS.hold_days) if (days >= tier.age_floor) return tier.days;
  return ASSUMPTIONS.hold_days[ASSUMPTIONS.hold_days.length - 1]!.days;
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

/**
 * The farm plan for one protocol: five steps that name the action, the money, the time and the way
 * out. Every figure comes from the protocol's own record or from the printed assumption table, and
 * every step ends with its cost and its clock, because a plan without those is a slogan.
 */
export function farmPlan(s: Scored): FarmStep[] {
  const p = s.protocol;
  const chain = primaryChain(p);
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(chain);
  const hold = holdDaysFor(s.age);
  const tvl = p.tvl_usd;
  const growth = p.change_7d;
  const growthText = growth === null ? 'no seven-day change is reported' : `TVL moved ${growth > 0 ? '+' : ''}${growth}% in seven days`;
  const ageText = s.age === null ? 'with no listed date' : `tracked since ${p.listed_at}, ${s.age} days`;
  const chainsText = p.chains.length === 0 ? 'its main chain' : `${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}`;
  const exitDays = hold * 2;
  return [
    {
      text: `${actionFor(p, capital)} ${p.name} holds ${usdCompact(tvl)} of TVL across ${chainsText} and its DefiLlama record carries no token, ${ageText}.`,
      cost: `${usd(capital)} capital`,
      time: 'same day',
    },
    {
      text: `Fund the wallet on ${chain} and open the position in one sitting; ${growthText}, which sets whether this is a first tranche or a full one.`,
      cost: `${usd(gas)} gas`,
      time: 'about 30 min',
    },
    {
      text: `Hold for ${hold} days before judging it. Airdrop snapshots cover weeks of activity, and a position closed in a week reads as a wallet farming a signature, not as a user.`,
      cost: 'no extra cost',
      time: `${hold} days`,
    },
    {
      text: `Watch TVL against today's ${usdCompact(tvl)}: add a second tranche if it holds 30 days above that line, and stop adding if it falls more than 25% below it, because a leaking pool is a launch that is not coming.`,
      cost: `${usd(capital)} more if it holds`,
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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * Build the whole radar: the curve, the odds table, the out-of-sample test, the ranked board and the
 * page's payload. The board holds every launch candidate, sorted by implied value, with the watchlist
 * guaranteed a place even where a protocol's own score would put it below the cut.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  if (!Array.isArray(snapshot.protocols) || snapshot.protocols.length === 0) {
    throw new SnapshotError('the snapshot carries no protocols');
  }
  const multiples = multiplesOf(snapshot.protocols);
  const curve = fitCurve(multiples);
  const launched = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const marketRate = launched / snapshot.protocols.length;
  const oddsTable = categoryOdds(snapshot.protocols, marketRate);
  const odds = new Map(oddsTable.map((o) => [o.key, o.odds]));
  const validation = validate(multiples, ['2024-01-01', '2024-07-01', '2025-01-01']);

  const scored: Scored[] = [];
  for (const p of snapshot.protocols) {
    if (!isLaunchCandidate(p)) continue;
    scored.push(score(p, curve, odds, snapshot.as_of));
  }
  // The watchlist is the floor of the board's coverage, never a ceiling on its ambition: every
  // rankable protocol is ranked, and the gate's coverage row is satisfied by construction.
  const chosen = new Set(scored.map((s) => s.protocol.slug));
  for (const slug of snapshot.watchlist) {
    if (chosen.has(slug)) continue;
    const p = snapshot.protocols.find((x) => x.slug === slug);
    if (p !== undefined) scored.push(score(p, curve, odds, snapshot.as_of));
  }
  scored.sort((a, b) => b.implied_value - a.implied_value || (a.protocol.slug < b.protocol.slug ? -1 : 1));
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
    implied_value_usd: s.implied_value,
    model: {
      version: MODEL_VERSION,
      size_multiple: round4(s.multiple),
      launch_odds: round4(s.odds),
      momentum: round4(s.momentum),
      maturity: round4(s.maturity),
      value_if_launched_usd: Math.round(s.value_if_launched),
    },
    farm_steps: farmPlan(s).map(stepText),
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
    mult: round4(s.multiple),
    odds: round4(s.odds),
    mo: round4(s.momentum),
    ma: round4(s.maturity),
    ifl: Math.round(s.value_if_launched),
    implied: s.implied_value,
    watch: watchlist.has(s.protocol.slug),
    farm: farmPlan(s),
  }));

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
    curve,
    bands: sizeBands(multiples),
    odds: oddsTable,
    validation,
    rows,
    live: multiples,
  };
  return { board, radar };
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
