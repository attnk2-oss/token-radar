/* Token Radar's page.
 *
 * One script, no framework, no network. It reads window.RADAR (written by main.ts from the sealed
 * snapshot) and renders two views off the same data: the board, which is the radar, and a protocol's
 * detail, which is the argument for its number. Every figure on screen is a field of that data or a
 * sum of fields; nothing is typed in by hand, so a screenshot cannot say something the code does not.
 *
 * Routing is the URL's hash: #p=<slug> opens a detail view, and ?cat=&min=&q= seed the filters. That
 * is what lets the three screenshots be three real states of the same page rather than three edits.
 */
(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D || !D.rows || !D.rows.length) {
    app.innerHTML = '<p class="empty">No radar data: data.js was not written beside the page.</p>';
    return;
  }

  /* ---------- formatting ---------- */

  /** Escapes text that came out of the snapshot, so a protocol's name cannot break the markup. */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** $204.0M, $2.76B, $840K: the way a reader says a number. */
  function money(n) {
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  /** +12.4% / -4.0% / an em dash when the snapshot reports no change. */
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + Number(n).toFixed(Math.abs(n) >= 10 ? 0 : 1) + '%';
  }

  function plurality(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** The snapshot's source with its scheme removed: the page may print a host, never a link. */
  function hostOf(source) {
    return String(source).replace(/^[a-z]+:\/\//, '');
  }

  /* ---------- state ---------- */

  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    cat: params.get('cat') || 'all',
    chain: params.get('chain') || 'all',
    min: Number(params.get('min') || 0),
    watch: params.get('watch') === '1',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
  };

  var bySlug = {};
  var maxImplied = 1;
  D.rows.forEach(function (row) {
    bySlug[row.slug] = row;
    if (row.implied > maxImplied) maxImplied = row.implied;
  });

  /** The categories and chains the filters offer, biggest first. */
  var categories = D.calibration.map(function (c) { return c.key; });
  var chainCounts = {};
  D.rows.forEach(function (row) {
    (row.chains.length ? row.chains : ['Unlisted']).forEach(function (chain) {
      chainCounts[chain] = (chainCounts[chain] || 0) + 1;
    });
  });
  var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });

  /** The board's rows under the current filters, ordered by the current sort. */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (row) {
      if (state.cat !== 'all' && row.cat !== state.cat) return false;
      if (state.chain !== 'all' && row.chains.indexOf(state.chain) === -1) return false;
      if (row.tvl < state.min) return false;
      if (state.watch && !row.watch) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().indexOf(q) !== -1 ||
        row.slug.indexOf(q) !== -1 ||
        row.cat.toLowerCase().indexOf(q) !== -1 ||
        row.chains.join(' ').toLowerCase().indexOf(q) !== -1
      );
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av = key === 'name' ? a.name : key === 'cat' ? a.cat : a[key];
      var bv = key === 'name' ? b.name : key === 'cat' ? b.cat : b[key];
      if (key === 'name' || key === 'cat') return state.dir * String(av).localeCompare(String(bv));
      if (av === null) av = state.dir > 0 ? Infinity : -Infinity;
      if (bv === null) bv = state.dir > 0 ? Infinity : -Infinity;
      return (av - bv) * state.dir || a.rank - b.rank;
    });
    return rows;
  }

  /* ---------- the board ---------- */

  function statTile(label, value, sub, accent) {
    return '<div class="stat"><span class="k">' + esc(label) + '</span><span class="v' +
      (accent ? ' accent' : '') + '">' + esc(value) + '</span><span class="s">' + esc(sub) + '</span></div>';
  }

  function header() {
    var m = D.meta;
    return '<header class="hdr">' +
      '<div class="brand"><span class="mark">◎</span><span class="wg">Token Radar</span>' +
      '<span class="tag">' + esc(m.model_version) + '</span></div>' +
      '<div class="hdr-meta">' +
        '<span>snapshot <b>' + esc(m.as_of) + '</b></span>' +
        '<span><b>' + m.protocols + '</b> protocols</span>' +
        '<span><b>' + m.ranked + '</b> ranked</span>' +
        '<span><b>' + m.watchlist + '</b> on the watchlist</span>' +
      '</div></header>';
  }

  function stats(rows) {
    var total = rows.reduce(function (sum, row) { return sum + row.implied; }, 0);
    var top = rows.slice().sort(function (a, b) { return b.implied - a.implied; })[0];
    return '<section class="stats">' +
      statTile('Pre-token protocols', String(D.meta.pre_token),
        'of ' + D.meta.protocols + ' at or above $5M TVL') +
      statTile('Ranked', String(D.rows.length), 'after the launch filter') +
      statTile('Aggregate implied value', money(total), 'the sum of ' + plurality(rows.length, 'row', 'rows'), true) +
      statTile('Market multiple', D.market.multiple.toFixed(3) + '×',
        'geometric mean mcap/TVL, ' + D.market.sample + ' launched') +
      statTile('Launch rate', (D.market.launch_rate * 100).toFixed(1) + '%',
        D.market.launched + ' of ' + D.market.protocols + ' record a token') +
      '</section>';
  }

  function toolbar() {
    var cats = ['<option value="all">Every category</option>'].concat(
      categories.map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      })
    );
    var chs = ['<option value="all">Every chain</option>'].concat(
      chains.slice(0, 40).map(function (c) {
        return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      })
    );
    var sizes = [
      { min: 0, label: 'All sizes' },
      { min: 1000000000, label: '≥ $1B' },
      { min: 250000000, label: '≥ $250M' },
      { min: 50000000, label: '≥ $50M' },
    ].map(function (s) {
      return '<button data-min="' + s.min + '"' + (state.min === s.min ? ' class="on"' : '') + '>' + s.label + '</button>';
    }).join('');
    return '<div class="tools">' +
      '<input class="search" id="q" type="search" placeholder="Filter by name, category or chain" value="' + esc(state.q) + '">' +
      '<select id="cat">' + cats.join('') + '</select>' +
      '<select id="chain">' + chs.join('') + '</select>' +
      '<div class="chips" id="sizes">' + sizes + '</div>' +
      '<div class="chips" id="watchchip"><button data-watch="1"' + (state.watch ? ' class="on"' : '') +
        '>Watchlist only</button></div>' +
      '<span class="count" id="count"></span>' +
      '</div>';
  }

  function sortHead(key, label, align, title) {
    var on = state.sort === key;
    var arrow = on ? (state.dir < 0 ? ' ↓' : ' ↑') : '';
    return '<th data-sort="' + key + '" class="' + (align === 'l' ? 'l ' : '') + (on ? 'on' : '') + '"' +
      (title ? ' title="' + esc(title) + '"' : '') + '>' + label + arrow + '</th>';
  }

  function boardTable() {
    var rows = visibleRows();
    var head = '<thead><tr>' +
      sortHead('rank', '#', 'l') +
      sortHead('name', 'Protocol', 'l') +
      sortHead('cat', 'Category', 'l') +
      sortHead('comps', 'Comps', 'n', 'Launched protocols of the same category the multiple rests on') +
      sortHead('tvl', 'TVL', 'n') +
      sortHead('ch', '7d TVL', 'n') +
      sortHead('launch', 'Launch odds', 'n', 'The category launch rate, shrunk toward the market rate') +
      sortHead('implied', 'Implied value', 'n', 'Value if it launched, times its launch odds and the age and momentum adjustments') +
      '</tr></thead>';
    var body = rows.map(function (row) {
      var cat = D.calibration.filter(function (c) { return c.key === row.cat; })[0];
      var launched = cat ? cat.launched : 0;
      var total = cat ? cat.protocols : 0;
      var trend = row.ch === null ? 'flat' : row.ch > 0 ? 'pos' : row.ch < 0 ? 'neg' : 'flat';
      var width = Math.max(2, Math.round((row.implied / maxImplied) * 100));
      var chainsText = row.chains.length ? row.chains.slice(0, 3).join(' · ') : 'unlisted chain';
      if (row.chains.length > 3) chainsText += ' +' + (row.chains.length - 3);
      return '<tr data-slug="' + esc(row.slug) + '">' +
        '<td class="rank">' + row.rank + '</td>' +
        '<td class="nm">' + esc(row.name) +
          (row.watch ? ' <span class="w" title="On the house watchlist: this radar covers all 40">W</span>' : '') +
          '<span class="sub">' + esc(chainsText) + '</span></td>' +
        '<td class="cat">' + esc(row.cat) + '</td>' +
        '<td class="num"><span class="ev' + (row.comps < 3 ? ' thin' : '') + '" title="' +
          (row.comps === 0 ? 'No launched comparable: the market multiple stands in'
            : esc(row.comps + ' launched comparable' + (row.comps === 1 ? '' : 's') + ' behind the multiple')) +
          '">' + row.comps + '</span></td>' +
        '<td class="num">' + money(row.tvl) + '</td>' +
        '<td class="num ' + trend + '">' + pct(row.ch) + '</td>' +
        '<td class="num"><span class="prob" title="' + esc(launched + ' of ' + total + ' ' + row.cat + ' protocols record a token') +
          '"><i><b style="width:' + Math.round(row.launch * 100) + '%"></b></i>' + Math.round(row.launch * 100) + '%</span></td>' +
        '<td><span class="val">' + money(row.implied) + '</span>' +
          '<span class="valbar" style="width:' + width + '%"></span></td>' +
        '</tr>';
    }).join('');
    return '<div class="tablewrap"><table>' + head + '<tbody>' +
      (body || '<tr><td colspan="8" class="empty">No protocol matches these filters.</td></tr>') +
      '</tbody></table></div>';
  }

  function calibrationRail() {
    var rows = D.calibration.slice(0, 10).map(function (c) {
      return '<tr><td>' + esc(c.key) + '</td>' +
        '<td class="n">' + c.protocols + '</td>' +
        '<td class="n">' + c.launched + '</td>' +
        '<td class="p">' + Math.round(c.launch_rate * 100) + '%</td>' +
        '<td class="m">' + c.multiple.toFixed(2) + '×</td></tr>';
    }).join('');
    return '<aside class="panel cal">' +
      '<div class="panel-hd"><h2>Calibration</h2><span class="hint">priced by its own launches</span></div>' +
      '<table><thead><tr><th class="l">Category</th><th>N</th><th>Live</th><th>Odds</th><th>Mult</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="note">Priced by <b>its own</b> launches, pulled toward the market when thin. <b>Comps</b> on the board ' +
      'is how many launched protocols the multiple rests on; <b>0</b> means the market multiple stands in.</p>' +
      '</aside>';
  }

  /** Where the board's value sits, by category: the concentration a reader should know before trusting a sum. */
  function concentrationRail(rows) {
    var byCategory = {};
    var total = 0;
    rows.forEach(function (row) {
      byCategory[row.cat] = (byCategory[row.cat] || 0) + row.implied;
      total += row.implied;
    });
    var ranked = Object.keys(byCategory)
      .map(function (key) { return { key: key, sum: byCategory[key] }; })
      .sort(function (a, b) { return b.sum - a.sum; });
    var max = ranked.length ? ranked[0].sum : 1;
    var body = ranked.slice(0, 6).map(function (entry) {
      return '<tr><td>' + esc(entry.key) + '</td>' +
        '<td class="amt">' + money(entry.sum) + '</td>' +
        '<td class="sh">' + (total ? Math.round((entry.sum / total) * 100) : 0) + '%</td>' +
        '<td style="width:74px"><span class="b" style="display:block;width:' +
          Math.max(2, Math.round((entry.sum / max) * 100)) + '%"></span></td></tr>';
    }).join('');
    return '<aside class="panel conc">' +
      '<div class="panel-hd"><h2>Where the value sits</h2><span class="hint">by category, these rows</span></div>' +
      '<table><tbody>' + (body || '<tr><td colspan="4" class="empty">no rows</td></tr>') + '</tbody></table>' +
      '<p class="note">The top category carries <b>' +
      (total && ranked.length ? Math.round((ranked[0].sum / total) * 100) : 0) +
      '%</b> of this view&rsquo;s value: a board one category wide is a bet on its launch habit.</p>' +
      '</aside>';
  }

  function method() {
    var m = D.model;
    var gas = D.assumptions.gas_usd.map(function (g) { return esc(g.chain) + ' $' + g.usd; }).join('  ');
    var caps = D.assumptions.capital_usd.map(function (c) {
      return (c.tvl_floor === 0 ? 'under $50M' : 'at or above ' + money(c.tvl_floor)) + ' → $' + c.usd;
    }).join(' · ');
    var holds = D.assumptions.hold_days.map(function (h) { return h.age_floor + 'd+ → ' + h.days + 'd'; }).join(' · ');
    return '<section class="method">' +
      '<div class="panel formula"><div class="panel-hd"><h2>How a number is made</h2>' +
        '<span class="hint">every factor from the snapshot, no name special-cased</span></div>' +
        '<div class="formula" style="padding-top:10px">' +
        '<pre>implied = tvl × multiple(category) × launch_rate(category)\n' +
        '                × momentum(Δ7d) × maturity(age_days)\n\n' +
        'multiple(category) = geomean(mcap/tvl of its launched\n' +
        '                     protocols), shrunk to ' + D.market.multiple.toFixed(3) + '×\n' +
        'launch_rate(cat)   = launched / protocols, shrunk to ' +
        (D.market.launch_rate * 100).toFixed(1) + '%\n' +
        'momentum           = 1 + ' + m.momentum_weight + '·tanh(clamp(Δ7d, ' +
        m.growth_floor_pct + ', ' + m.growth_cap_pct + ') / ' + m.momentum_scale_pct + ')\n' +
        'maturity           = 1.0 inside ' + m.young_days + '–' + m.old_days + ' days;\n' +
        '                     ' + m.young_floor + '→1.0 before, −' + (m.old_decay_per_year * 100) +
        '%/yr to ' + m.old_floor + ' after</pre>' +
        '<p class="fnote">Shrinkage uses a pseudo-count of ' + m.shrink_launch +
        ' protocols on the launch rate and ' + m.shrink_multiple +
        ' on the multiple: a category with one comparable lands a seventh of the way from the market, ' +
        'not at its lone outlier. Ratios outside ' + m.ratio_floor + '×–' + m.ratio_cap + '× are treated as data errors.</p>' +
        '</div></div>' +
      '<div class="panel assume"><div class="panel-hd"><h2>Assumptions the plans use</h2>' +
        '<span class="hint">printed, so they can be argued with</span></div>' +
        '<div class="assume" style="padding-top:10px">' +
        '<h3>Gas per position</h3><table><tr><td>' + gas + '</td></tr></table>' +
        '<h3>Capital per qualifying position</h3><table><tr><td>' + caps + '</td></tr></table>' +
        '<h3>Hold before judging</h3><table><tr><td>' + holds + '</td></tr></table>' +
        '</div></div>' +
      '<div class="panel limits"><div class="panel-hd"><h2>What this radar does not know</h2></div>' +
        '<div class="limits" style="padding-top:9px"><ul>' +
        '<li><b>No token supply.</b> The snapshot carries market cap, not float, so every multiple is a ' +
        'value against TVL, not a price per token.</li>' +
        '<li><b>TVL is not revenue.</b> A $2.7B pool can earn less than a $200M one. The multiple prices ' +
        'the protocol&rsquo;s size, and the category calibration is what keeps a thin, asset-light ' +
        'category from being priced like a well-sampled one.</li>' +
        '<li><b>A launch is not promised.</b> The odds are a category rate, not a schedule. A protocol ' +
        'can sit on this board for years and never issue anything.</li>' +
        '</ul></div></div>' +
      '</section>' +
      '<div class="foot"><span><b>' + esc(D.meta.model_version) + '</b> model</span>' +
      '<span>source <b>' + esc(hostOf(D.meta.source)) + '</b></span>' +
      '<span>watchlist floor <b>' + money(D.meta.floor_usd) + '</b></span>' +
      '<span>sum <b>' + D.meta.ranked + '</b> rows across <b>' + D.calibration.length + '</b> categories</span></div>';
  }

  function renderBoard() {
    var rows = visibleRows();
    app.innerHTML = header() + stats(rows) +
      '<section class="main"><div class="panel">' +
      '<div class="panel-hd"><h2>The board</h2><span class="hint">ranked by implied value; click a row for its argument</span></div>' +
      toolbar() + boardTable() + '</div>' +
      '<div class="rail">' + calibrationRail() + concentrationRail(rows) + '</div></section>' + method();
    var count = document.getElementById('count');
    count.textContent = rows.length + ' of ' + D.rows.length + ' rows';
    wireBoard();
  }

  /* ---------- one protocol ---------- */

  function renderDetail(slug) {
    var row = bySlug[slug];
    if (!row) {
      location.hash = '';
      return;
    }
    var cat = D.calibration.filter(function (c) { return c.key === row.cat; })[0];
    var comps = (cat ? cat.comparables : []).slice(0, 9);
    var compMax = comps.reduce(function (m, c) { return Math.max(m, c.multiple); }, 0.01);
    var gas = D.assumptions.gas_usd.filter(function (g) { return row.chains.indexOf(g.chain) !== -1; })[0];
    var gasCost = gas ? gas.usd : D.assumptions.gas_default_usd;
    var chainsText = row.chains.length ? row.chains.slice(0, 4).join(', ') : 'no chain listed';
    var ageText = row.age === null ? 'no listed date' : row.age + ' days tracked, no token';
    var total = cat ? cat.protocols : 0;
    var launched = cat ? cat.launched : 0;
    var compNote = cat && cat.comparables.length
      ? plurality(cat.comparables.length, 'launched comparable', 'launched comparables') + ': ' +
        cat.comparables.slice(0, 3).map(function (c) { return esc(c.name) + ' at ' + c.multiple.toFixed(2) + '×'; }).join(', ')
      : 'no launched comparable: the market multiple of ' + D.market.multiple.toFixed(3) + '× stands in';

    var atMarket = row.tvl * D.market.multiple * row.launch * row.mo * row.ma;
    var atRawMultiple = cat && cat.raw_multiple ? row.tvl * cat.raw_multiple * row.launch * row.mo * row.ma : null;
    var atRawOdds = cat ? row.tvl * row.mult * cat.raw_launch_rate * row.mo * row.ma : null;
    var swings = [
      ['the category multiple, shrunk to the market', row.mult.toFixed(3) + '×', money(row.implied)],
      ['the category multiple, at its raw median', cat && cat.raw_multiple ? cat.raw_multiple.toFixed(3) + '×' : '—',
        atRawMultiple === null ? '—' : money(atRawMultiple)],
      ['the market multiple instead of the category', D.market.multiple.toFixed(3) + '×', money(atMarket)],
      ['the category odds, unshrunk', cat ? (cat.raw_launch_rate * 100).toFixed(1) + '%' : '—',
        atRawOdds === null ? '—' : money(atRawOdds)],
    ].map(function (s) {
      return '<tr><td class="l">' + esc(s[0]) + '</td><td class="num">' + esc(s[1]) + '</td>' +
        '<td class="num ink">' + esc(s[2]) + '</td></tr>';
    }).join('');
    var water = [
      ['TVL', money(row.tvl), 'across ' + (row.chains.length || 0) + ' chain(s), ' + esc(D.meta.as_of)],
      ['× category multiple', row.mult.toFixed(3) + '×', compNote + ' · at the market multiple (' +
        D.market.multiple.toFixed(3) + '×) it would be ' + money(atMarket)],
      ['= value if it launched', money(row.ifl), 'the size a launch would be priced at today'],
      ['× launch odds', (row.launch * 100).toFixed(1) + '%',
        launched + ' of ' + total + ' ' + row.cat + ' protocols record a token'],
      ['× momentum', row.mo.toFixed(3), row.ch === null ? 'no seven-day change reported' : 'TVL ' + pct(row.ch) + ' in seven days'],
      ['× maturity', row.ma.toFixed(3), ageText + (row.ma === 1 ? ', inside the full-value band' : '')],
    ].map(function (w) {
      return '<div class="wrow"><span class="wl">' + w[0] + '</span><span class="wv">' + w[1] +
        '</span><span class="wn">' + w[2] + '</span></div>';
    }).join('');

    var compRows = comps.length
      ? comps.map(function (c) {
        return '<tr><td class="l">' + esc(c.name) + '</td>' +
          '<td class="num">' + money(c.tvl_usd) + '</td>' +
          '<td class="num">' + money(c.mcap_usd) + '</td>' +
          '<td class="num ink">' + c.multiple.toFixed(2) + '×</td>' +
          '<td class="barcell"><span class="b" style="display:block;width:' +
            Math.max(3, Math.round((c.multiple / compMax) * 100)) + '%"></span></td></tr>';
      }).join('')
      : '<tr><td class="l" colspan="5" style="color:var(--faint)">No launched protocol in this category: the market multiple stands in.</td></tr>';

    var steps = row.farm.map(function (s, i) {
      return '<div class="step"><span class="no">' + (i + 1) + '</span><div>' +
        '<div class="tx">' + esc(s.text) + '</div>' +
        '<div class="mt"><span>' + esc(s.cost) + '</span><span>' + esc(s.time) + '</span></div>' +
        '</div></div>';
    }).join('');

    app.innerHTML = header() +
      '<a class="back" id="back" href="#">← The board</a>' +
      '<div class="dhead">' +
        '<span class="drank">#' + row.rank + '</span>' +
        '<div><h1>' + esc(row.name) + '</h1><div class="who">' + esc(row.cat) + ' · ' + esc(chainsText) +
          ' · listed <b>' + esc(row.listed || 'unknown') + '</b></div></div>' +
        '<div class="dval"><div class="b">' + money(row.implied) + '</div><div class="c">implied value</div></div>' +
      '</div>' +
      '<p class="summary">If ' + esc(row.name) + ' launched a token, the snapshot&rsquo;s own comparable protocols put it at <b>' +
        money(row.ifl) + '</b>. Only <b>' + (row.launch * 100).toFixed(1) + '%</b> of ' + esc(row.cat) +
        ' protocols ever recorded one, and seven days of TVL moved <b>' + pct(row.ch) +
        '</b>, so the expected value today is <b>' + money(row.implied) + '</b>. The plan below costs about <b>$' +
        gasCost + '</b> in gas plus the position itself, and takes <b>' + (row.farm[2] ? esc(row.farm[2].time) : 'weeks') + '</b> to judge.</p>' +
      '<section class="detail">' +
        '<div class="stack">' +
          '<div class="panel"><div class="panel-hd"><h2>The number, one factor at a time</h2>' +
            '<span class="hint">every step is a field of the snapshot</span></div>' +
            '<div class="wf">' + water +
            '<div class="wrow total"><span class="wl">= implied value</span><span class="wv">' + money(row.implied) +
            '</span><span class="wn">what the board ranks</span></div></div></div>' +
          '<div class="panel comps"><div class="panel-hd"><h2>The comparables behind the multiple</h2>' +
            '<span class="hint">launched ' + esc(row.cat) + ' protocols, by mcap/TVL</span></div>' +
            '<table><thead><tr><th class="l">Protocol</th><th>TVL</th><th>Market cap</th><th>Mcap/TVL</th><th></th></tr></thead>' +
            '<tbody>' + compRows + '</tbody></table></div>' +
          '<div class="panel"><div class="panel-hd"><h2>If the model were cruder</h2>' +
            '<span class="hint">what each calibration choice is worth</span></div>' +
            '<table><tbody>' + swings + '</tbody></table>' +
            '<p class="note">The number does not hinge on one choice: this is the whole spread a reader can argue ' +
            'with. The board ranks the shrunk figure, because a raw category median can rest on one protocol.</p></div>' +
        '</div>' +
        '<div class="stack">' +
          '<div class="panel"><div class="panel-hd"><h2>Farm it</h2>' +
            '<span class="hint">cost and clock on every step</span></div>' +
            '<div class="farm">' + steps + '</div></div>' +
        '</div>' +
      '</section>' + method();

    document.getElementById('back').onclick = function (event) {
      event.preventDefault();
      location.hash = '';
    };
  }

  /* ---------- wiring ---------- */

  function wireBoard() {
    var q = document.getElementById('q');
    q.oninput = function () {
      state.q = q.value;
      var rows = visibleRows();
      document.querySelector('.tablewrap').outerHTML = boardTable();
      document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' rows';
      wireRows();
    };
    var cat = document.getElementById('cat');
    cat.onchange = function () { state.cat = cat.value; renderBoard(); };
    var chain = document.getElementById('chain');
    chain.onchange = function () { state.chain = chain.value; renderBoard(); };
    document.getElementById('watchchip').onclick = function () {
      state.watch = !state.watch;
      renderBoard();
    };
    document.getElementById('sizes').onclick = function (event) {
      var min = event.target.getAttribute && event.target.getAttribute('data-min');
      if (min === null) return;
      state.min = Number(min);
      renderBoard();
    };
    document.querySelectorAll('thead th[data-sort]').forEach(function (th) {
      th.onclick = function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else {
          state.sort = key;
          state.dir = key === 'name' || key === 'cat' || key === 'rank' ? 1 : -1;
        }
        renderBoard();
      };
    });
    wireRows();
  }

  function wireRows() {
    document.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.onclick = function () {
        location.hash = 'p=' + tr.getAttribute('data-slug');
      };
    });
  }

  function route() {
    var match = /^#p=(.+)$/.exec(location.hash);
    if (match) renderDetail(decodeURIComponent(match[1]));
    else renderBoard();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  route();
})();
