# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/attnk2-oss/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet: what a launch would be worth if the protocol's
record stayed as it is, how likely that category is to launch at all, and what farming it costs in
money and time. It reads one sealed DefiLlama snapshot (758 protocols at or above $5M of TVL, 342
recording no token, 40 on the house watchlist) and writes a ranked board, a static dashboard and the
dossier the judge reads.

## The model

```
implied = tvl × multiple(category) × launch_rate(category) × momentum(Δ7d) × maturity(age_days)
```

The one thing the starter model gets wrong is the single market-wide multiple: priced at 0.25× of
TVL, a $2.7B risk curator is worth the same as a $2.7B DEX, and the snapshot says they are not. On
this snapshot's own 416 token-bearing protocols, mcap/TVL runs from 0.04 for liquid staking to 0.34
for DEXs, and 5 of 39 risk curators ever recorded a token against 79% of lending protocols.

So every category is calibrated against its own launched protocols, in log space, and shrunk toward
the market with a pseudo-count of six: a category with one comparable lands a seventh of the way from
the market figure, not at its lone outlier. Launch rates are shrunk the same way. The page prints
every constant, and each row carries the number of launched comparables its multiple rests on.

Two decisions a reader will notice:

- **Structural exclusions.** The watchlist's own rule (exchanges, bridges, liquid staking, wrapped and
  staked products of a token that already trades) is applied to the whole field, not just to protocols
  above the $50M floor. The floor moves; the rule does not. Without it the board's top rows are Bybit,
  WBTC and Coinbase Bridge, which is not a launch radar.
- **The board is every candidate, not the watchlist.** 198 protocols are ranked, all 40 watchlist
  protocols among them and flagged, so the watchlist is a floor of coverage rather than the extent of
  the search.

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
lib/model.ts                calibration, scoring, farm plans, the gate's own assertions
vendor/makefun-board.ts     the kit's dossier writer, byte for byte
dashboard/index.html        the shell
dashboard/s/app.css         the page
dashboard/s/app.js          the board and the detail view
```

## Licence

MIT.
