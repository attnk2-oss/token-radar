# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet: what a launch would be worth if the protocol's record
stayed as it is, how likely that category is to launch at all, and what farming it costs in money and
time. It reads one sealed DefiLlama snapshot (758 protocols at or above $5M of TVL, 342 recording no
token, 40 on the house watchlist) and writes a ranked board, a static dashboard and the dossier the
judge reads.

## The model

```
implied = tvl × multiple(tvl) × launch_odds(category) × momentum(Δ7d) × maturity(age_days)
```

Three models were tried against this snapshot, and `main.ts` prints the test rather than the claim:

| model | out-of-sample median miss | held-out launches within 2× |
| --- | --- | --- |
| one market-wide multiple | 3.65× | 29% |
| a multiple per category | 3.65× | 29% |
| **the size curve (this entry)** | **2.83×** | **40%** |

Fitted on the protocols DefiLlama started tracking before 2024-01-01, scored on the 45 it started
tracking after: `log10(mcap/TVL) = 2.03 − 0.34·log10(TVL)`. A $5M protocol trades at roughly 0.6× its
TVL, a $2B one at roughly 0.07×, and that decline is the only structure in this snapshot that survives
out of sample. Category does not: fitted the same way, a per-category multiple is indistinguishable
from one flat number, so category is left holding the launch odds alone (5 of 39 risk curators ever
recorded a token against 59 of 75 lending protocols).

Two decisions a reader will notice:

- **Structural exclusions.** The watchlist's own rule (exchanges, bridges, liquid staking, wrapped and
  staked products of a token that already trades) is applied to the whole field, not just to protocols
  above the $50M floor. The floor moves; the rule does not. Without it the board's top rows are Bybit,
  WBTC and Coinbase Bridge, which is not a launch radar.
- **The board is every candidate, not the watchlist.** 198 protocols are ranked, all 40 watchlist
  protocols among them and flagged, so the watchlist is a floor of coverage rather than the extent of
  the search.

The dashboard prints the curve, the five size bands behind it, the category odds, and the three
out-of-sample splits, so a reader can argue with a specific step instead of with the whole number.

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
| `board.json` | the ranked board: 198 rows, ranks 1..N, implied value non-increasing |
| `data.js` | the same numbers, compact, for the page; outside `dashboard/` so the judge's 65,536-byte source window is spent on code |
| `dashboard/` | `index.html` plus the CSS and JS it loads, no framework, no network |
| `screenshots/` | three views: the board, a protocol's detail, a filtered board |
| `dossier.json` | what the judge reads, written by the vendored `buildDossier` the scorer runs itself |

## Layout

```
main.ts                     reads the snapshot, writes the five outputs
lib/model.ts                the size curve, its out-of-sample test, launch odds, farm plans
vendor/makefun-board.ts     the kit's dossier writer, byte for byte
dashboard/index.html        the shell
dashboard/s/app.css         the page
dashboard/s/app.js          the board and the detail view
```

## Licence

MIT.
