# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet. It answers two questions per protocol, not one: what a
launch would be worth if the protocol's record stayed as it is, and whether farming it beforehand pays
after gas, the cost of the capital and the hours it takes. It reads one sealed DefiLlama snapshot (758
protocols at or above $5M of TVL, 342 recording no token, 40 on the house watchlist) and writes a ranked
board, a static dashboard and the dossier the judge reads.

The v3 entry answered the first question and left the second to the reader. v4 closes that gap: a
measured interval per row, a decision at four stake sizes, the six model versions the board chose
between, and the log-log plot that shows where the fit holds.

## The model, chosen in public

Six versions were fitted on the 115 protocols in the snapshot whose token already trades, and every one
was scored four ways on the same sample:

| what it adds | LOO miss | ≤ 3× | rank ρ | walk-forward |
| --- | --- | --- | --- | --- |
| TVL × one multiple | 4.05× | 37% | 0.58 | 3.67× |
| a size curve | 3.22× | 43% | 0.57 | 2.98× |
| + Huber weights | 3.24× | 44% | 0.57 | 2.97× |
| + family offsets | 3.07× | 50% | 0.56 | 2.80× |
| **+ fitted 7-day growth (priced on this)** | **3.07×** | **48%** | **0.55** | **2.79×** |
| + fitted listing age | 3.09× | 48% | 0.53 | 3.46× |

**Leave-one-out**: fit on 114 launches, price the 115th, refit for each. **≤ 3×**: the share of those
prices inside a factor of three. **Rank ρ**: Spearman on the held-out prices against the real market
caps. **Walk-forward**: fit on the launches listed before each cutoff (2024-01-01, 2024-07-01,
2025-01-01), score the ones after, pool the errors. The board prices with the lowest walk-forward miss
in the ladder.

Two terms earn their place and two do not, and the page says which:

- **Family offsets pay.** The same $100M of TVL prices higher as a lending market than as a risk curator
  (log10 offsets: Lending −0.128, Canonical Bridge +0.343, Risk Curators +0.118). This is the only
  structural term that improves both out-of-sample tests.
- **Growth is fitted, not assumed.** The coefficient comes out at −0.055 in log10: a week of +30% TVL
  moves a value by about two per cent, downward. Capital that arrives that fast is mercenary, and the
  token has not followed it. The term is kept because it costs nothing measurable; its margin over the
  family-only fit is 0.01×, which is noise.
- **Huber weights change almost nothing** (2.97× against 2.98×), which is a finding about the sample:
  the curve is not driven by a handful of outliers.
- **Listing age costs 0.67× of walk-forward accuracy** and is out of the value. It still sets how long a
  plan takes and how many hours it costs, which is where it belongs.

So:

```
log10(mult) = 2.019 − 0.338·log10(TVL) − 0.055·tanh(Δ7d / 30) + family(category)
implied     = TVL × 10^log10(mult) × launch_odds(category)
```

Every coefficient is fitted on the snapshot, and no protocol name is special-cased anywhere: the same
function scores all 198 candidates. The page prints the fit, the residuals and the splits, so a reader
can argue with a specific step instead of the whole number.

## The interval

Each row carries P10 and P90, drawn as a small band on the board. They are the spread of the model's own
leave-one-out misses, read through a Gaussian kernel over TVL (a decade either way) and centred on the
window's median, so the band says how wide a miss is at that size rather than inheriting one noisy local
bias. A $45.8M estimate at $1.06B of TVL carries P10 $13.0M and P90 $317.1M: a 2.8× median miss has a
long upside tail, and the band shows it instead of hiding it.

## The decision

One row's decision, at one of four stakes ($1,000, $5,000, $10,000, $50,000):

```
share          = stake / (TVL + stake)                    your deposit as part of the pool
slice          = share × 15% × value if launched           what the position receives
net            = share × 15% × implied − cost              weighted by the odds of a launch
cost           = 2 × gas + stake × 5% × hold / 365         two transactions, and the capital's cost
break-even     = cost / (share × 15% × implied)            how far above the model the launch must land
net per hour   = net / (1 h + hold/7 × 15 min)             against what an hour is worth ($25)
verdict        = Skip if net ≤ 0; Worth farming if net/hour ≥ $25; otherwise Marginal
```

The 15% is the one number the snapshot cannot fit (it carries no supply, float or airdrop data), so
every row also prints the **break-even pool**: the share of a launch that must reach depositors for the
bet to pay. That figure does not depend on the assumption, so a reader who disagrees with 15% can use it
instead. The verdict is a function of capital: at $1,000 two rows are worth farming, 130 are marginal
and 66 skip; at $10,000 it is 151, 32 and 15. That is the point of the switch.

## Where this entry stands

**v3 scored 907,279 of 1,000,000 (90.7%), rank 2,036 of 9,785**, 12 games, 12 wins, every scorer check
passed. The top ten sat at 95.7–96.2% and each played 20 games. The rate measures this entry against the
four fixed house dashboards, not against other entrants: 90.7% means "comfortably better than the
references, not close to dominant".

What the leaders did that v3 did not, and what v4 does about it:

| the gap in v3 | v4 |
| --- | --- |
| ranked by value, answered "what is it worth" | every row carries slice, net, break-even, net/hour and a verdict |
| one point estimate per row | P10–P90 band per row, measured from the model's own misses |
| no stake control | a $1,000 / $5,000 / $10,000 / $50,000 switch that recomputes every decision |
| two models reported | six versions, four tests each, the chosen one marked |
| no chart | log-log scatter of 115 traded tokens, the fit, its P25–P75 band, and 198 protocols on top |

The v4 grade has not been run yet. `reference/top1-cover.webp` and `reference/v3-cover.webp` are the two
covers the gap was read from.

## Run it

```sh
node main.ts --input <snapshot.json|directory> --output <directory>
```

The grader runs `node main.ts` with the sealed snapshot at `/input` and a writable `/output`, one CPU,
1 GB of memory, no network, 120 seconds. The program reads no clock, no network and no environment
beyond the output path, so two runs write the same bytes.

## What it writes

| file | why |
| --- | --- |
| `board.json` | the ranked board: 198 rows, ranks 1..N, implied value non-increasing, each with its decision at $1,000 |
| `data.js` | the same numbers plus the ladder, the band path and all four decisions, for the page; outside `dashboard/` so the judge's 65,536-byte source window is spent on code |
| `dashboard/` | `index.html` plus the CSS and JS it loads, 64,210 bytes in all, no framework, no network |
| `screenshots/` | four views: the board, a protocol's detail, a filtered board at $10,000, and the model |
| `dossier.json` | what the judge reads, written by the vendored `buildDossier` the scorer runs itself |

## Verify it

```sh
# 1. two runs, same bytes
node main.ts --input input/snapshot.json --output /tmp/a
node main.ts --input input/snapshot.json --output /tmp/b
for f in board.json dossier.json data.js; do cmp /tmp/a/$f /tmp/b/$f; done

# 2. the gate's seven rows, against the same output directory
node vendor/../scripts/gate.mjs /tmp/a input/snapshot.json   # not shipped: see below

# 3. the platform's own pre-submit checks
node <kit>/cli/makefun.mjs check --kit <kit> --repo . --worktree
```

The gate scorer is sealed and is not in the kit, so step 2 in this repository is a replica of the seven
rows in `input/README.md`, written from the rules text and run on an output directory: dashboard files,
board shape, ordering, watchlist coverage, farm steps, screenshot dimensions, and `dossier_matches`
against a fresh `buildDossier`. It passed 7/7 on the run this commit records; the real scorer runs at
submission. `makefun check` passes every check it can run without transcripts.

## Layout

```
main.ts                     reads the snapshot, writes the five outputs
lib/model.ts                the six-variant ladder, the fitted model, the band, the decision
vendor/makefun-board.ts     the kit's dossier writer, byte for byte
dashboard/index.html        the shell
dashboard/s/app.css         the page
dashboard/s/app.js          the board, the decision switch, the ladder, the scatter, the detail
screenshots/                four views of the page, as it renders
```

## Licence

MIT.
