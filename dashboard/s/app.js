'use strict';

(function () {
  const R = window.RADAR;
  const root = document.getElementById('app');
  if (!R || !root) return;

  const rows = R.rows || [];
  const meta = R.meta || {};
  const assumptions = R.assumptions || {};
  const tiers = Array.isArray(assumptions.stake_tiers) && assumptions.stake_tiers.length
    ? assumptions.stake_tiers.slice()
    : [1000];
  const chosen = (R.ladder || []).find(function (rung) { return rung.chosen; }) || (R.ladder || [])[0] || {};

  const state = {
    tier: 0,
    verdict: 'all',
    query: '',
    cat: 'all',
    chain: 'all',
    view: 'board',
    sortKey: 'rank',
    sortDir: 1,
    selected: null
  };

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e8) return '$' + (n / 1e6).toFixed(0) + 'M';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'k';
    if (abs >= 1) return '$' + n.toFixed(2);
    if (abs === 0) return '$0.00';
    return '$' + n.toFixed(3);
  }

  function signedMoney(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    return (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
  }

  function shortMoney(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'k';
    return '$' + n.toFixed(2);
  }

  function pct(value, digits) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return (Number(value) * 100).toFixed(digits == null ? 0 : digits) + '%';
  }

  function num(value, digits) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return Number(value).toFixed(digits == null ? 2 : digits);
  }

  function ageMonths(row) {
    if (row.age == null || !Number.isFinite(Number(row.age))) return '—';
    return (Number(row.age) / 30.44).toFixed(Number(row.age) < 120 ? 1 : 0) + ' mo';
  }

  function verdictClass(word) {
    if (word === 'Worth farming') return 'v-worth';
    if (word === 'Skip') return 'v-skip';
    return 'v-marginal';
  }

  function signClass(value) {
    return Number(value) < 0 ? 'neg' : Number(value) > 0 ? 'pos' : '';
  }

  function normDecisions(row) {
    if (Array.isArray(row.dec)) return row.dec;
    if (row.dec && typeof row.dec === 'object') return [row.dec];
    return [];
  }

  /* The row ships one decision per tier. If a board ever carries only the
     default tier, the fallback below rebuilds the same arithmetic from the
     row's plan and the printed assumptions, and the page says that it did. */
  function fallbackDecision(row, stake) {
    const share = stake / (row.tvl + stake);
    const pool = Number(assumptions.pool_share) || 0;
    const slice = share * pool * row.ifl;
    const weighted = share * pool * row.implied;
    const hold = Number(row.hold) || 0;
    const hours = Number(row.hours) || 0;
    const gas = Number(row.gas) || 0;
    const trips = Number(assumptions.gas_trips) || 2;
    const apr = Number(assumptions.capital_cost_apr) || 0;
    const cost = gas * trips + (stake * apr * hold) / 365;
    const net = weighted - cost;
    const netPerHour = hours > 0 ? net / hours : 0;
    const breakEven = weighted > 0 ? cost / weighted : 99;
    const breakEvenPool = row.implied > 0 ? cost / (share * row.implied) : 99;
    const labour = Number(assumptions.labour_usd_per_hour) || 25;
    return {
      stake: stake,
      slice_usd: slice,
      net_if_launch_usd: slice - cost,
      net_usd: net,
      break_even: Math.min(breakEven, 99),
      break_even_pool: Math.min(breakEvenPool, 99),
      cost_usd: cost,
      hours: hours,
      net_per_hour: netPerHour,
      verdict: net <= 0 ? 'Skip' : netPerHour >= labour ? 'Worth farming' : 'Marginal'
    };
  }

  function decisionAt(row, tierIndex) {
    const stake = tiers[tierIndex] || tiers[0];
    const found = normDecisions(row).find(function (d) { return Number(d.stake) === Number(stake); });
    if (found) return { d: found, fallback: false };
    return { d: fallbackDecision(row, stake), fallback: true };
  }

  function currentDecision(row) {
    return decisionAt(row, state.tier);
  }

  function verdictOf(row) {
    return currentDecision(row).d.verdict || 'Marginal';
  }

  function allChains() {
    const seen = new Set();
    rows.forEach(function (row) {
      (row.chains || []).forEach(function (chain) { seen.add(chain); });
    });
    return Array.from(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function allCategories() {
    return Array.from(new Set(rows.map(function (row) { return row.cat || 'Uncategorised'; })))
      .sort(function (a, b) { return a.localeCompare(b); });
  }

  function chipCounts() {
    const counts = { all: rows.length, watchlist: 0, worth: 0, marginal: 0, skip: 0 };
    rows.forEach(function (row) {
      if (row.watch) counts.watchlist += 1;
      const v = verdictOf(row);
      if (v === 'Worth farming') counts.worth += 1;
      else if (v === 'Skip') counts.skip += 1;
      else counts.marginal += 1;
    });
    return counts;
  }

  function matches(row) {
    if (state.verdict === 'watchlist' && !row.watch) return false;
    if (state.verdict === 'worth' && verdictOf(row) !== 'Worth farming') return false;
    if (state.verdict === 'marginal' && verdictOf(row) !== 'Marginal') return false;
    if (state.verdict === 'skip' && verdictOf(row) !== 'Skip') return false;
    if (state.cat !== 'all' && (row.cat || 'Uncategorised') !== state.cat) return false;
    if (state.chain !== 'all' && !(row.chains || []).includes(state.chain)) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const hay = [row.name, row.cat, (row.chains || []).join(' '), row.slug].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function sortValue(row, key) {
    const d = currentDecision(row).d;
    if (key === 'name') return row.name.toLowerCase();
    if (key === 'implied') return row.implied;
    if (key === 'tvl') return row.tvl;
    if (key === 'ch') return row.ch == null ? -Infinity : row.ch;
    if (key === 'age') return row.age == null ? -Infinity : row.age;
    if (key === 'slice') return d.slice_usd;
    if (key === 'net') return d.net_usd;
    if (key === 'breakEven') return d.break_even;
    if (key === 'netPerHour') return d.net_per_hour;
    if (key === 'verdict') return d.verdict;
    return row.rank;
  }

  function visibleRows() {
    return rows.filter(matches).sort(function (a, b) {
      const av = sortValue(a, state.sortKey);
      const bv = sortValue(b, state.sortKey);
      let order;
      if (typeof av === 'string' || typeof bv === 'string') order = String(av).localeCompare(String(bv));
      else order = av === bv ? 0 : av < bv ? -1 : 1;
      if (order === 0) order = a.rank - b.rank;
      return order * state.sortDir;
    });
  }

  function bandText(band) {
    if (!Array.isArray(band)) return '';
    return shortMoney(band[0]) + '–' + shortMoney(band[band.length - 1]);
  }

  function bandTrack(row, cls) {
    const b = row.band || [];
    const lo = Number(b[0]);
    const hi = Number(b[b.length - 1]);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return '';
    const span = hi - lo;
    const at = Math.max(0, Math.min(100, ((row.implied - lo) / span) * 100));
    return '<div class="track ' + (cls || '') + '"><span class="dot" style="left:' + at.toFixed(2) + '%"></span></div>';
  }

  function badges(row) {
    let out = '';
    if (row.watch) out += '<span class="badge b-watch">watchlist</span>';
    if (row.tvl >= Number(meta.floor_usd || 0)) out += '<span class="badge b-floor">above floor</span>';
    if (row.age != null && Number(row.age) < 365) out += '<span class="badge b-early">early</span>';
    return out ? '<span class="badges">' + out + '</span>' : '';
  }

  function sortHeader(key, label, extra) {
    const active = state.sortKey === key;
    const arrow = active ? '<span class="arrow">' + (state.sortDir > 0 ? '↑' : '↓') + '</span>' : '';
    return '<th data-sort="' + key + '" class="' + (extra || '') + '" aria-sort="' +
      (active ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none') + '">' + label + arrow + '</th>';
  }

  function integrityText() {
    const ranked = meta.ranked;
    return 'board.json = this page: ' + ranked + '/' + ranked + ' ranks · values · bands · verdicts';
  }

  function renderShell() {
    const counts = chipCounts();
    const mk = chosen.name || 'chosen fit';
    const categories = allCategories();
    const chains = allChains();
    root.innerHTML =
      '<header class="top"><div class="top-inner">' +
        '<div class="brand"><span class="mark" aria-hidden="true">LR</span><div>' +
          '<h1>Launch Radar</h1>' +
          '<p>Pre-token protocols ranked by implied value — and whether farming them pays</p>' +
        '</div></div>' +
        '<div class="integrity" id="integrity">' + esc(integrityText()) + '</div>' +
      '</div></header>' +
      '<main>' +
        '<section class="kpis" aria-label="Board summary">' +
          '<div class="kpi"><b>' + esc(meta.watchlist_covered) + '/' + esc(meta.watchlist) + '</b><span>watchlist protocols ranked</span></div>' +
          '<div class="kpi"><b>' + esc(meta.ranked) + '</b><span>ranked; ' + esc(meta.pre_token) + ' record no token</span></div>' +
          '<div class="kpi"><b>' + esc(R.market.launched) + '</b><span>already trade; chosen fit misses ' + esc(num(chosen.walkForward, 2)) + '× median</span></div>' +
          '<div class="kpi"><b>' + esc(R.coverage.setAside.length) + '</b><span>set aside, each with a reason</span></div>' +
          '<div class="kpi"><b>' + esc(num(chosen.loo, 2)) + '× / ' + esc(num(chosen.walkForward, 2)) + '×</b><span>leave-one-out / walk-forward miss</span></div>' +
        '</section>' +
        '<section class="methods" aria-label="Method and validation">' +
          '<div class="card method"><h2>The fitted formula</h2>' +
            '<div class="formula">log<sub>10</sub>(mult) = <b>' + esc(num(R.curve.intercept, 3)) + '</b> ' +
              (R.curve.slope < 0 ? '− ' : '+ ') + esc(num(Math.abs(R.curve.slope), 3)) + '·log<sub>10</sub>(TVL) ' +
              (R.curve.growth < 0 ? '− ' : '+ ') + esc(num(Math.abs(R.curve.growth), 3)) + '·tanh(Δ7d/30) + family<br>' +
              '<span class="muted">fitted on ' + esc(R.curve.sample) + ' launches, residual SD ' + esc(num(R.curve.residual_sd, 2)) + '</span></div>' +
            '<p class="note">The band is the spread of the model’s own leave-one-out misses, read through a Gaussian kernel over TVL and centred on the window median. Residual quantiles in log<sub>10</sub>:</p>' +
            '<div class="quantiles"><span class="q">P10 <b>' + esc(num(R.residual.p10, 2)) + '</b></span><span class="q">P25 <b>' + esc(num(R.residual.p25, 2)) + '</b></span>' +
              '<span class="q">P75 <b>' + esc(num(R.residual.p75, 2)) + '</b></span><span class="q">P90 <b>' + esc(num(R.residual.p90, 2)) + '</b></span></div>' +
          '</div>' +
          '<div class="card method"><h2>Where the fit holds</h2><div class="scatter-wrap" id="scatter-wrap"></div>' +
            '<div class="legend"><span><i style="background:#75817b"></i>traded</span><span><i style="background:#b3bbb6"></i>set aside</span>' +
              '<span><i style="background:#24332e"></i>pre-token</span><span><i style="background:#0a8b76"></i>watchlist</span>' +
              '<span><i style="background:#0a8b76;opacity:.3"></i>P25–P75 band</span></div></div>' +
          '<div class="card method"><h2>What earns its place</h2>' +
            '<table class="ladder"><thead><tr><th>what it adds</th><th>LOO miss</th><th>≤3×</th><th>rank ρ</th><th>walk-forward</th></tr></thead><tbody>' +
              (R.ladder || []).map(function (rung) {
                return '<tr class="' + (rung.chosen ? 'chosen' : '') + '"><td>' + esc(rung.name) + (rung.chosen ? '<span class="pick">chosen</span>' : '') + '</td>' +
                  '<td>' + esc(num(rung.loo, 2)) + '×</td><td>' + esc(pct(rung.withinThree)) + '</td><td>' + esc(num(rung.rho, 2)) + '</td><td>' + esc(num(rung.walkForward, 2)) + '×</td></tr>';
              }).join('') +
            '</tbody></table><p class="note"><b>' + esc(mk) + '</b> prices the board: lowest walk-forward miss in the ladder.</p></div>' +
        '</section>' +
        '<section class="filters" aria-label="Filters">' +
          '<div class="chips" id="chips">' +
            '<button class="chip active" data-verdict="all">All <b>' + counts.all + '</b></button>' +
            '<button class="chip" data-verdict="watchlist">Watchlist <b>' + counts.watchlist + '</b></button>' +
            '<button class="chip" data-verdict="worth">Worth farming <b>' + counts.worth + '</b></button>' +
            '<button class="chip" data-verdict="marginal">Marginal <b>' + counts.marginal + '</b></button>' +
            '<button class="chip" data-verdict="skip">Skip <b>' + counts.skip + '</b></button>' +
          '</div>' +
          '<label class="field">Find <input id="search" type="search" placeholder="name, category, chain" autocomplete="off"></label>' +
          '<label class="field">Category <select id="cat-filter"><option value="all">All</option>' +
            categories.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') +
          '</select></label>' +
          '<label class="field">Chain <select id="chain-filter"><option value="all">All</option>' +
            chains.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') +
          '</select></label>' +
          '<span class="seg-label">Stake</span><div class="seg" id="stake-switch" role="group" aria-label="Stake">' +
            tiers.map(function (stake, i) { return '<button data-tier="' + i + '" class="' + (i === 0 ? 'active' : '') + '">' + esc(shortMoney(stake)) + '</button>'; }).join('') +
          '</div>' +
          '<span class="spacer"></span>' +
          '<span class="seg-label">View</span><div class="seg" id="view-switch" role="group" aria-label="View">' +
            '<button data-view="board" class="active">Board</button><button data-view="aside">Set aside</button>' +
          '</div>' +
        '</section>' +
        '<section id="board-card" class="card board-card">' +
          '<div class="section-head"><div><h2>Ranked board</h2><p>Implied value with its measured band; the decision is the selected stake.</p></div><span class="count" id="row-count"></span></div>' +
          '<div class="table-wrap" id="board-wrap"></div>' +
        '</section>' +
        '<section id="aside-card" class="card aside-card" hidden>' +
          '<div class="section-head" style="padding:0 0 8px"><div><h2>Set aside</h2><p>Every pre-token protocol kept off the board, grouped by the rule that kept it there.</p></div><span class="count" id="aside-count"></span></div>' +
          '<div class="aside-groups" id="aside-groups"></div>' +
        '</section>' +
      '</main>' +
      '<footer><span>Model ' + esc(meta.model_version) + ' · snapshot ' + esc(meta.as_of) + ' · ' + esc(meta.protocols) + ' protocols accounted for</span>' +
        '<span>No network; all numbers from data.js</span></footer>' +
      '<div id="detail-host"></div>';
    drawScatter();
    renderBoard();
    renderAside();
  }

  function drawScatter() {
    const host = document.getElementById('scatter-wrap');
    if (!host) return;
    const pts = (R.scatter || []).filter(function (p) {
      return p.tvl > 0 && p.value > 0 && Number.isFinite(Math.log10(p.tvl)) && Number.isFinite(Math.log10(p.value));
    });
    const curve = (R.band_curve || []).filter(function (p) { return p.tvl > 0 && p.mult > 0; });
    if (!pts.length) { host.innerHTML = '<p class="note">No scatter data.</p>'; return; }

    const W = 500;
    const H = 158;
    const pad = { l: 42, r: 8, t: 8, b: 27 };
    const xVals = pts.map(function (p) { return Math.log10(p.tvl); });
    const yVals = pts.map(function (p) { return Math.log10(p.value); });
    curve.forEach(function (p) {
      xVals.push(Math.log10(p.tvl));
      yVals.push(Math.log10(p.tvl * p.mult), Math.log10(p.tvl * p.lo), Math.log10(p.tvl * p.hi));
    });
    let x0 = Math.floor(Math.min.apply(null, xVals));
    let x1 = Math.ceil(Math.max.apply(null, xVals));
    let y0 = Math.floor(Math.min.apply(null, yVals));
    let y1 = Math.ceil(Math.max.apply(null, yVals));
    if (x1 <= x0) x1 = x0 + 1;
    if (y1 <= y0) y1 = y0 + 1;
    const sx = function (v) { return pad.l + ((Math.log10(v) - x0) / (x1 - x0)) * (W - pad.l - pad.r); };
    const sy = function (v) { return H - pad.b - ((Math.log10(v) - y0) / (y1 - y0)) * (H - pad.t - pad.b); };

    let svg = '<svg id="scatter" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Log-log scatter of protocol TVL against token or implied value, with fitted line and P25 to P75 band">';
    svg += '<title>TVL and value on log axes</title>';
    for (let x = x0; x <= x1; x += 1) {
      const px = pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
      svg += '<line class="grid" x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '"/>';
      svg += '<text x="' + px.toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + (x >= 9 ? '$' + Math.pow(10, x - 9).toFixed(0) + 'B' : x >= 6 ? '$' + Math.pow(10, x - 6).toFixed(0) + 'M' : '$' + Math.pow(10, x).toFixed(0)) + '</text>';
    }
    for (let y = y0; y <= y1; y += 1) {
      const py = H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
      svg += '<line class="grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + py.toFixed(1) + '" y2="' + py.toFixed(1) + '"/>';
      svg += '<text x="' + (pad.l - 4) + '" y="' + (py + 2.5).toFixed(1) + '" text-anchor="end">' + (y >= 9 ? '$' + Math.pow(10, y - 9).toFixed(0) + 'B' : y >= 6 ? '$' + Math.pow(10, y - 6).toFixed(0) + 'M' : '$' + Math.pow(10, y).toFixed(0)) + '</text>';
    }
    svg += '<line class="axis" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + (H - pad.b) + '" y2="' + (H - pad.b) + '"/>';
    svg += '<line class="axis" x1="' + pad.l + '" x2="' + pad.l + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '"/>';
    svg += '<text x="' + (W - pad.r) + '" y="' + (H - 2) + '" text-anchor="end">TVL</text>';
    svg += '<text x="' + (pad.l + 4) + '" y="' + (pad.t + 7) + '">$ value</text>';

    if (curve.length) {
      const upper = curve.map(function (p) { return sx(p.tvl).toFixed(1) + ',' + sy(p.tvl * p.hi).toFixed(1); });
      const lower = curve.slice().reverse().map(function (p) { return sx(p.tvl).toFixed(1) + ',' + sy(p.tvl * p.lo).toFixed(1); });
      svg += '<polygon class="band" points="' + upper.concat(lower).join(' ') + '"/>';
      svg += '<polyline class="fit" points="' + curve.map(function (p) { return sx(p.tvl).toFixed(1) + ',' + sy(p.tvl * p.mult).toFixed(1); }).join(' ') + '"/>';
    }
    pts.forEach(function (p) {
      svg += '<circle class="pt k' + (p.kind || 0) + '" cx="' + sx(p.tvl).toFixed(1) + '" cy="' + sy(p.value).toFixed(1) + '" r="' + (p.kind === 3 ? 2.1 : 1.55) + '"><title>' + esc(p.name) + ' · TVL ' + money(p.tvl) + ' · value ' + money(p.value) + '</title></circle>';
    });
    svg += '</svg>';
    host.innerHTML = svg;
  }

  function boardHTML() {
    const list = visibleRows();
    const count = document.getElementById('row-count');
    if (count) count.innerHTML = '<b>' + list.length + '</b> of ' + rows.length + ' rows · ' + esc(shortMoney(tiers[state.tier])) + ' stake';
    if (!list.length) return '<div class="empty">No rows match these filters.</div>';
    let html = '<table class="board" aria-label="Ranked protocols"><thead><tr>' +
      sortHeader('rank', '#', 'num') +
      sortHeader('name', 'Protocol') +
      sortHeader('implied', 'Implied value', 'num') +
      '<th>Band</th>' +
      sortHeader('tvl', 'TVL', 'num') +
      sortHeader('ch', '7d', 'num') +
      sortHeader('age', 'No token', 'num') +
      sortHeader('slice', 'Slice if launch', 'num') +
      sortHeader('net', 'Net if launch', 'num') +
      sortHeader('breakEven', 'Break-even', 'num') +
      sortHeader('netPerHour', 'Net / hour', 'num') +
      sortHeader('verdict', 'Verdict') +
      '</tr></thead><tbody>';
    list.forEach(function (row) {
      const got = currentDecision(row);
      const d = got.d;
      const chains = (row.chains || []).slice(0, 3).join(' · ') + ((row.chains || []).length > 3 ? ' +' + ((row.chains || []).length - 3) : '');
      html += '<tr tabindex="0" data-slug="' + esc(row.slug) + '" aria-label="Open ' + esc(row.name) + '">' +
        '<td class="rank num">' + esc(row.rank) + '</td>' +
        '<td class="protocol"><span class="pname">' + esc(row.name) + '</span>' + badges(row) +
          '<span class="meta">' + esc(row.cat || 'Uncategorised') + ' · family ' + (row.fam > 0 ? '+' : '') + esc(num(row.fam, 3)) + ' · ' + esc(chains || 'no chain listed') + '</span></td>' +
        '<td class="num"><span class="value">' + money(row.implied) + '</span><span class="sub">' + esc(bandText(row.band)) + '</span></td>' +
        '<td class="whisker">' + bandTrack(row) + '<span class="sub">P10–P90</span></td>' +
        '<td class="num nowrap">' + money(row.tvl) + '</td>' +
        '<td class="num nowrap ' + signClass(row.ch) + '">' + (row.ch == null ? '—' : (row.ch > 0 ? '+' : '') + num(row.ch, 2) + '%') + '</td>' +
        '<td class="num nowrap">' + esc(ageMonths(row)) + '</td>' +
        '<td class="num nowrap">' + money(d.slice_usd) + (d.net_usd < 0 ? '<span class="sub neg">launch-weighted net ' + signedMoney(d.net_usd) + '</span>' : '') + '</td>' +
        '<td class="num nowrap ' + signClass(d.net_if_launch_usd) + '">' + signedMoney(d.net_if_launch_usd) + '</td>' +
        '<td class="num nowrap">' + num(d.break_even, 2) + '×</td>' +
        '<td class="num nowrap ' + signClass(d.net_per_hour) + '">' + signedMoney(d.net_per_hour) + '/h</td>' +
        '<td><span class="badge ' + verdictClass(d.verdict) + '">' + esc(d.verdict) + '</span></td>' +
        '</tr>';
    });
    return html + '</tbody></table>';
  }

  function renderBoard() {
    const wrap = document.getElementById('board-wrap');
    if (!wrap) return;
    wrap.innerHTML = boardHTML();
    wrap.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail(tr.getAttribute('data-slug'));
        }
      });
    });
    wrap.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.getAttribute('data-sort');
        if (state.sortKey === key) state.sortDir *= -1;
        else { state.sortKey = key; state.sortDir = key === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
  }

  function renderAside() {
    const host = document.getElementById('aside-groups');
    if (!host) return;
    const entries = R.coverage.setAside || [];
    const groups = new Map();
    entries.forEach(function (entry) {
      if (!groups.has(entry.reason)) groups.set(entry.reason, []);
      groups.get(entry.reason).push(entry);
    });
    const count = document.getElementById('aside-count');
    if (count) count.innerHTML = '<b>' + entries.length + '</b> excluded protocols · ' + groups.size + ' reasons';
    const sorted = Array.from(groups.entries()).sort(function (a, b) {
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    host.innerHTML = sorted.map(function (pair) {
      return '<div class="aside-group"><h3><span style="font-family:inherit;font-weight:inherit;background:none;padding:0">' + esc(pair[0]) + '</span><span aria-label="count">' + pair[1].length + '</span></h3><ol>' +
        pair[1].slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (entry) {
          return '<li><b>' + esc(entry.name) + '</b><em>' + esc(entry.reason) + '</em></li>';
        }).join('') + '</ol></div>';
    }).join('');
  }

  function renderFilterState() {
    document.querySelectorAll('#chips .chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.getAttribute('data-verdict') === state.verdict);
    });
    document.querySelectorAll('#stake-switch button').forEach(function (button) {
      button.classList.toggle('active', Number(button.getAttribute('data-tier')) === state.tier);
    });
    document.querySelectorAll('#view-switch button').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-view') === state.view);
    });
    const counts = chipCounts();
    document.querySelectorAll('#chips .chip').forEach(function (chip) {
      const key = chip.getAttribute('data-verdict');
      const n = key === 'all' ? counts.all : key === 'watchlist' ? counts.watchlist : key === 'worth' ? counts.worth : key === 'marginal' ? counts.marginal : counts.skip;
      const b = chip.querySelector('b');
      if (b) b.textContent = n;
    });
    const board = document.getElementById('board-card');
    const aside = document.getElementById('aside-card');
    if (board) board.hidden = state.view !== 'board';
    if (aside) aside.hidden = state.view !== 'aside';
  }

  function openDetail(slug) {
    const row = rows.find(function (r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug;
    const d = currentDecision(row).d;
    const decisions = tiers.map(function (stake, i) {
      const found = decisionAt(row, i);
      return { d: found.d, fallback: found.fallback };
    });
    const currentTier = tiers[state.tier];
    const fallbackAny = decisions.some(function (x) { return x.fallback; });
    const host = document.getElementById('detail-host');
    const chainText = (row.chains || []).join(' · ') || 'no chain listed';
    host.innerHTML =
      '<aside class="detail" role="dialog" aria-modal="false" aria-label="' + esc(row.name) + ' detail" id="detail">' +
        '<div class="detail-head"><div><h2>' + esc(row.name) + '</h2><p>' + esc(row.cat || 'Uncategorised') + ' · rank ' + esc(row.rank) + ' · ' + esc(chainText) + '</p></div>' +
          '<button class="close" id="detail-close" aria-label="Close detail">×</button></div>' +
        '<div class="dgrid">' +
          '<div class="dstat"><span>Implied value</span><b class="pos">' + money(row.implied) + '</b></div>' +
          '<div class="dstat"><span>Value if launched</span><b>' + money(row.ifl) + '</b></div>' +
          '<div class="dstat"><span>Launch odds</span><b>' + pct(row.odds, 1) + '</b></div>' +
          '<div class="dstat"><span>TVL</span><b>' + money(row.tvl) + '</b></div>' +
          '<div class="dstat"><span>7-day change</span><b class="' + signClass(row.ch) + '">' + (row.ch == null ? '—' : (row.ch > 0 ? '+' : '') + num(row.ch, 2) + '%') + '</b></div>' +
          '<div class="dstat"><span>Tracked since</span><b>' + esc(row.listed || '—') + '</b></div>' +
          '<div class="dstat"><span>Hold</span><b>' + esc(row.hold) + ' days</b></div>' +
          '<div class="dstat"><span>Gas / trip</span><b>' + money(row.gas) + '</b></div>' +
          '<div class="dstat"><span>Hours</span><b>' + esc(num(row.hours, 2)) + ' h</b></div>' +
        '</div>' +
        '<h3>Measured band</h3>' +
        '<div class="bandviz">' + bandTrack(row, 'wide') +
          '<div class="bandlabels"><span>P10 ' + shortMoney(row.band[0]) + '</span><span>P25 ' + shortMoney(row.band[1]) + '</span><span>P75 ' + shortMoney(row.band[2]) + '</span><span>P90 ' + shortMoney(row.band[3]) + '</span></div></div>' +
        '<p class="note">The dot is the implied value. The band is the model’s leave-one-out spread at this TVL, not a confidence interval on a different model.</p>' +
        '<h3>Farm steps</h3><ol class="farm">' +
          (row.farm || []).map(function (step) {
            return '<li><p>' + esc(step.text) + '</p><small>' + esc(step.cost) + ' · ' + esc(step.time) + '</small></li>';
          }).join('') + '</ol>' +
        '<h3>Decision at every stake</h3><div class="detail-scroll"><table class="decisions">' +
          '<thead><tr><th>Stake</th><th>Slice</th><th>Net if launch</th><th>Net</th><th>Break-even</th><th>Cost</th><th>Net / h</th><th>Verdict</th></tr></thead><tbody>' +
          decisions.map(function (item) {
            const x = item.d;
            return '<tr class="' + (Number(x.stake) === Number(currentTier) ? 'current' : '') + '"><td>' + shortMoney(x.stake) + '</td><td>' + money(x.slice_usd) + '</td>' +
              '<td class="' + signClass(x.net_if_launch_usd) + '">' + signedMoney(x.net_if_launch_usd) + '</td>' +
              '<td class="' + signClass(x.net_usd) + '">' + signedMoney(x.net_usd) + '</td>' +
              '<td>' + num(x.break_even, 2) + '×<span class="sub">pool ' + num(x.break_even_pool, 2) + '×</span></td>' +
              '<td>' + money(x.cost_usd) + '<span class="sub">' + esc(num(x.hours, 2)) + ' h</span></td>' +
              '<td class="' + signClass(x.net_per_hour) + '">' + signedMoney(x.net_per_hour) + '</td>' +
              '<td><span class="badge ' + verdictClass(x.verdict) + '">' + esc(x.verdict) + '</span></td></tr>';
          }).join('') +
          '</tbody></table></div>' +
        (fallbackAny ? '<p class="dnote">This row carried only some stake tiers; the missing figures are recomputed from the printed formula and assumptions.</p>' : '') +
        '<p class="note">Selected stake: <b>' + shortMoney(currentTier) + '</b>. Net is launch-weighted; break-even is how far above the model a launch must land. Pool break-even is the share of launch value depositors need.</p>' +
      '</aside>';
    const close = document.getElementById('detail-close');
    if (close) close.addEventListener('click', closeDetail);
  }

  function closeDetail() {
    state.selected = null;
    const host = document.getElementById('detail-host');
    if (host) host.innerHTML = '';
  }

  function bindControls() {
    document.getElementById('chips').addEventListener('click', function (event) {
      const chip = event.target.closest('[data-verdict]');
      if (!chip) return;
      state.verdict = chip.getAttribute('data-verdict');
      renderFilterState();
      renderBoard();
    });
    document.getElementById('stake-switch').addEventListener('click', function (event) {
      const button = event.target.closest('[data-tier]');
      if (!button) return;
      state.tier = Number(button.getAttribute('data-tier'));
      renderFilterState();
      renderBoard();
      if (state.selected) openDetail(state.selected);
    });
    document.getElementById('view-switch').addEventListener('click', function (event) {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      state.view = button.getAttribute('data-view');
      renderFilterState();
    });
    const search = document.getElementById('search');
    search.addEventListener('input', function () {
      state.query = search.value.trim();
      renderBoard();
    });
    document.getElementById('cat-filter').addEventListener('change', function (event) {
      state.cat = event.target.value;
      renderBoard();
    });
    document.getElementById('chain-filter').addEventListener('change', function (event) {
      state.chain = event.target.value;
      renderBoard();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDetail();
    });
  }

  renderShell();
  bindControls();
})();
