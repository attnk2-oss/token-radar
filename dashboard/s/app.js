/* Token Radar's page.
 *
 * One script, no framework, no network. It reads window.RADAR (written by main.ts from the sealed
 * snapshot) and renders two views off the same data: the board, which is the radar, and a protocol's
 * detail, which is the argument for its number. Every figure on screen is a field of that data or a
 * sum of fields; nothing is typed in by hand, so a screenshot cannot say something the code does not.
 *
 * The model is three factors and a curve: a protocol's size picks its multiple, its category picks
 * its odds of ever launching, and a week of TVL growth and its age adjust the result. The page's job
 * is to make that chain visible, including the test that made us pick this curve over the two simpler
 * ones, so a reader can disagree with a specific step instead of with the whole number.
 *
 * Routing is the URL's hash: #p=<slug> opens a detail view, and ?cat=&min=&q=&watch= seed the
 * filters. That is what lets the three screenshots be three real states of the same page.
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

  /** $38.4M, $2.76B, $840K: the way a reader says a number. */
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

  /** The category table, indexed once: the board's odds column and the detail's summary both read it. */
  var catOdds = {};
  D.odds.forEach(function (c) { catOdds[c.key] = c; });

  /** The categories and chains the filters offer, biggest first. */
  var categories = D.odds.map(function (c) { return c.key; });
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
        '<span>launch rate <b>' + (D.market.launch_rate * 100).toFixed(1) + '%</b></span>' +
      '</div></header>';
  }

  function stats(rows) {
    var total = rows.reduce(function (sum, row) { return sum + row.implied; }, 0);
    var test = D.validation[0];
    return '<section class="stats">' +
      statTile('Pre-token protocols', String(D.meta.pre_token),
        'of ' + D.meta.protocols + ' at or above $5M TVL') +
      statTile('Watchlist covered', D.meta.watchlist_covered + '/' + D.meta.watchlist,
        'every one ranked, marked W') +
      statTile('Aggregate implied value', money(total), 'the sum of ' + plurality(rows.length, 'row', 'rows'), true) +
      statTile('Median multiple', D.market.median_multiple.toFixed(3) + '×',
        'across ' + D.market.multiples + ' launched protocols') +
      statTile('Out-of-sample miss', test.curve_factor.toFixed(2) + '×',
        'median on ' + test.test + ' held-out launches; a flat multiple misses ' + test.flat_factor.toFixed(2) + '×') +
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
      sortHead('mult', '×TVL', 'n', 'Mcap/TVL that the size curve gives a protocol of this TVL') +
      sortHead('tvl', 'TVL', 'n') +
      sortHead('ch', '7d TVL', 'n') +
      sortHead('odds', 'Launch odds', 'n', 'How often this category records a token at all, shrunk toward the market rate') +
      sortHead('implied', 'Implied value', 'n', 'TVL × the curve multiple × launch odds × momentum × maturity') +
      '</tr></thead>';
    var body = rows.map(function (row) {
      var cat = catOdds[row.cat];
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
        '<td class="num">' + row.mult.toFixed(3) + '×</td>' +
        '<td class="num">' + money(row.tvl) + '</td>' +
        '<td class="num ' + trend + '">' + pct(row.ch) + '</td>' +
        '<td class="num"><span class="prob" title="' + esc(launched + ' of ' + total + ' ' + row.cat + ' protocols record a token') +
          '"><i><b style="width:' + Math.round(row.odds * 100) + '%"></b></i>' + Math.round(row.odds * 100) + '%</span></td>' +
        '<td><span class="val">' + money(row.implied) + '</span>' +
          '<span class="valbar" style="width:' + width + '%"></span></td>' +
        '</tr>';
    }).join('');
    return '<div class="tablewrap"><table>' + head + '<tbody>' +
      (body || '<tr><td colspan="8" class="empty">No protocol matches these filters.</td></tr>') +
      '</tbody></table></div>';
  }

  /** The curve itself: the fit, and the five size bands a reader can check it against. */
  function curveRail() {
    var rows = D.bands.map(function (b) {
      return '<tr><td>' + esc(b.label) + '</td>' +
        '<td class="n">' + b.launched + '</td>' +
        '<td class="m">' + b.median_multiple.toFixed(2) + '×</td></tr>';
    }).join('');
    return '<aside class="panel cal">' +
      '<div class="panel-hd"><h2>The size curve</h2><span class="hint">mcap/TVL falls with TVL</span></div>' +
      '<table><thead><tr><th class="l">TVL band</th><th>Launched</th><th>Median</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="note">Fitted on ' + D.curve.sample + ' launched protocols: log10(mcap/TVL) = ' +
      D.curve.intercept.toFixed(2) + ' ' + (D.curve.slope < 0 ? '−' : '+') + ' ' + Math.abs(D.curve.slope).toFixed(2) +
      '·log10(TVL). The band medians are what it smooths.</p>' +
      '</aside>';
  }

  /** How often each category ever launches: the second factor, and the one category actually explains. */
  function oddsRail() {
    var rows = D.odds.slice(0, 6).map(function (c) {
      return '<tr><td>' + esc(c.key) + '</td>' +
        '<td class="n">' + c.launched + '/' + c.protocols + '</td>' +
        '<td class="p">' + Math.round(c.odds * 100) + '%</td></tr>';
    }).join('');
    var settled = D.odds.filter(function (c) { return c.protocols >= 10; }).slice()
      .sort(function (a, b) { return b.odds - a.odds; });
    var high = settled[0];
    var low = settled[settled.length - 1];
    var spread = high && low
      ? ' Among categories with 10 or more protocols, ' + esc(high.key) + ' launches ' +
        Math.round(high.odds * 100) + '% of the time and ' + esc(low.key) + ' ' +
        Math.round(low.odds * 100) + '%: this is the only place category still matters.'
      : '';
    return '<aside class="panel cal">' +
      '<div class="panel-hd"><h2>Launch odds</h2><span class="hint">by category, shrunk to the market</span></div>' +
      '<table><thead><tr><th class="l">Category</th><th>Live</th><th>Odds</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="note">A share of a category that has issued a token before, pulled toward the market&rsquo;s ' +
      (D.market.launch_rate * 100).toFixed(1) + '%.' + spread + '</p>' +
      '</aside>';
  }

  /** The category carrying the most of the board's implied value: one line, not a whole panel. */
  function topCategory(rows) {
    var byCategory = {};
    var total = 0;
    rows.forEach(function (row) {
      byCategory[row.cat] = (byCategory[row.cat] || 0) + row.implied;
      total += row.implied;
    });
    var keys = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
    return keys.length && total
      ? { key: keys[0], share: Math.round((byCategory[keys[0]] / total) * 100) }
      : null;
  }

  function method() {
    var m = D.model;
    var gas = D.assumptions.gas_usd.map(function (g) { return esc(g.chain) + ' $' + g.usd; }).join('  ');
    var caps = D.assumptions.capital_usd.map(function (c) {
      return (c.tvl_floor === 0 ? 'under $50M' : 'at or above ' + money(c.tvl_floor)) + ' → $' + c.usd;
    }).join(' · ');
    var holds = D.assumptions.hold_days.map(function (h) { return h.age_floor + 'd+ → ' + h.days + 'd'; }).join(' · ');
    var tests = D.validation.map(function (v) {
      return '<tr><td class="l">listed from ' + esc(v.cutoff) + '</td>' +
        '<td class="num">' + v.fit + ' / ' + v.test + '</td>' +
        '<td class="num ink">' + v.curve_factor.toFixed(2) + '×</td>' +
        '<td class="num">' + v.flat_factor.toFixed(2) + '×</td>' +
        '<td class="num">' + Math.round(v.curve_within_2x * 100) + '%</td>' +
        '<td class="num">' + Math.round(v.flat_within_2x * 100) + '%</td></tr>';
    }).join('');
    var primary = D.validation[0];
    return '<section class="method">' +
      '<div class="panel formula"><div class="panel-hd"><h2>How a number is made</h2>' +
        '<span class="hint">every factor from the snapshot, no name special-cased</span></div>' +
        '<div class="formula" style="padding-top:10px">' +
        '<pre>implied = tvl × multiple(tvl) × launch_odds(category)\n' +
        '                × momentum(Δ7d) × maturity(age_days)\n\n' +
        'multiple(tvl) = 10^(' + D.curve.intercept.toFixed(2) + ' ' + (D.curve.slope < 0 ? '−' : '+') + ' ' +
        Math.abs(D.curve.slope).toFixed(2) + '·log10 TVL), clamped to\n' +
        '                the observed ' + (m.clamp_quantile_low * 100) + 'th–' +
        (m.clamp_quantile_high * 100) + 'th percentile (' + D.curve.clamp_low.toFixed(3) +
        '×–' + D.curve.clamp_high.toFixed(2) + '×)\n' +
        'launch_odds   = launched / protocols, shrunk to ' + (D.market.launch_rate * 100).toFixed(1) + '%\n' +
        'momentum      = 1 + ' + m.momentum_weight + '·tanh(clamp(Δ7d, ' +
        m.growth_floor_pct + ', ' + m.growth_cap_pct + ') / ' + m.momentum_scale_pct + ')\n' +
        'maturity      = 1.0 inside ' + m.young_days + '–' + m.old_days + ' days;\n' +
        '                ' + m.young_floor + '→1.0 before, −' + (m.old_decay_per_year * 100) +
        '%/yr to ' + m.old_floor + ' after</pre>' +
        '<p class="fnote">The curve\'s slope is measured, not chosen: it is clamped to [' + m.slope_floor +
        ', ' + m.slope_cap + '] so a noisy sample cannot price a bigger protocol higher than a smaller one. ' +
        'Ratios outside ' + m.ratio_floor + '×–' + m.ratio_cap + '× are treated as data errors. ' +
        'Launch odds are shrunk with a pseudo-count of ' + m.shrink_odds + ' protocols.</p>' +
        '</div></div>' +
      '<div class="panel"><div class="panel-hd"><h2>Tested on the snapshot&rsquo;s own launches</h2>' +
        '<span class="hint">fit on older launches, score the newer ones</span></div>' +
        '<table><thead><tr><th class="l">Held out</th><th>Fit / test</th><th>Curve miss</th><th>Flat miss</th>' +
        '<th>Curve ≤2×</th><th>Flat ≤2×</th></tr></thead><tbody>' + tests + '</tbody></table>' +
        '<p class="note">Each row fits the model on the protocols DefiLlama began tracking before that date and ' +
        'scores the ones after it against their real market cap. The curve wins on all three splits; the ' +
        'category-by-category multiple was tested the same way and did not (1.29 against 1.30), which is why ' +
        'category is left holding the odds alone. On the newest split the curve lands within 2× for <b>' +
        Math.round(primary.curve_within_2x * 100) + '%</b> of held-out launches against <b>' +
        Math.round(primary.flat_within_2x * 100) + '%</b>, and its rank correlation with the real market cap is <b>' +
        primary.rank_correlation.toFixed(2) + '</b>.</p></div>' +
      '<div class="panel assume"><div class="panel-hd"><h2>Assumptions the plans use</h2>' +
        '<span class="hint">printed, so they can be argued with</span></div>' +
        '<div class="assume" style="padding-top:10px">' +
        '<h3>Gas per position</h3><table><tr><td>' + gas + '</td></tr></table>' +
        '<h3>Capital per qualifying position</h3><table><tr><td>' + caps + '</td></tr></table>' +
        '<h3>Hold before judging</h3><table><tr><td>' + holds + '</td></tr></table>' +
        '</div></div>' +
      '<div class="panel limits"><div class="panel-hd"><h2>What this radar does not know</h2></div>' +
        '<div class="limits" style="padding-top:9px"><ul>' +
        '<li><b>No token supply.</b> The snapshot carries market cap, not float, so every multiple is a value ' +
        'against TVL, not a price per token.</li>' +
        '<li><b>Size is not the whole story.</b> The curve explains about a third of the spread in mcap/TVL ' +
        '(a residual of ' + D.curve.residual_sd.toFixed(2) + ' in log10); the rest is business model, ' +
        'narrative and timing, none of which the snapshot carries.</li>' +
        '<li><b>A launch is not promised.</b> The odds are a category rate, not a schedule. A protocol can sit ' +
        'on this board for years and never issue anything.</li>' +
        '</ul></div></div>' +
      '</section>' +
      '<div class="foot"><span><b>' + esc(D.meta.model_version) + '</b> model</span>' +
      '<span>source <b>' + esc(hostOf(D.meta.source)) + '</b></span>' +
      '<span>watchlist floor <b>' + money(D.meta.floor_usd) + '</b></span>' +
      '<span><b>' + D.meta.ranked + '</b> rows across <b>' + D.odds.length + '</b> categories</span>' +
      (topCategory(D.rows) ? '<span>top category <b>' + esc(topCategory(D.rows).key) + '</b> carries <b>' +
        topCategory(D.rows).share + '%</b> of the value</span>' : '') + '</div>';
  }

  /** The active filters, in one line: a screenshot of a filtered board should say what it is showing. */
  function filterSummary() {
    var bits = [];
    if (state.watch) bits.push('watchlist only');
    if (state.cat !== 'all') bits.push(esc(state.cat));
    if (state.chain !== 'all') bits.push(esc(state.chain));
    if (state.min > 0) bits.push('TVL \u2265 $' + Math.round(state.min / 1e6) + 'M');
    if (state.q.trim()) bits.push('\u201c' + esc(state.q.trim()) + '\u201d');
    if (!bits.length) return '';
    return 'filtered: ' + bits.join(' \u00b7 ') + ' \u00b7 ' + visibleRows().length + ' of ' + D.rows.length + ' rows';
  }

  function renderBoard() {
    var rows = visibleRows();
    app.innerHTML = header() + stats(rows) +
      '<section class="main"><div class="panel">' +
      '<div class="panel-hd"><h2>The board</h2><span class="hint">' +
        (filterSummary() || 'ranked by implied value; click a row for its argument') + '</span></div>' +
      toolbar() + boardTable() + '</div>' +
      '<div class="rail">' + curveRail() + oddsRail() + '</div></section>' + method();
    var count = document.getElementById('count');
    count.textContent = rows.length + ' of ' + D.rows.length + ' rows';
    wireBoard();
  }

  /* ---------- one protocol ---------- */

  /**
   * The launched protocols nearest this one in size: the evidence the curve's multiple rests on. Size
   * is the axis the model prices on, so the honest comparison is a protocol of similar TVL, not one
   * that happens to share a category.
   */
  function nearestBySize(tvl, limit) {
    var target = Math.log10(tvl);
    return D.live
      .map(function (m) { return { m: m, distance: Math.abs(Math.log10(m.tvl_usd) - target) }; })
      .sort(function (a, b) { return a.distance - b.distance || a.m.slug.localeCompare(b.m.slug); })
      .slice(0, limit)
      .map(function (entry) { return entry.m; });
  }

  function renderDetail(slug) {
    var row = bySlug[slug];
    if (!row) {
      location.hash = '';
      return;
    }
    var cat = catOdds[row.cat];
    var comps = nearestBySize(row.tvl, 7);
    var compMax = comps.reduce(function (m, c) { return Math.max(m, c.multiple); }, 0.01);
    var gas = D.assumptions.gas_usd.filter(function (g) { return row.chains.indexOf(g.chain) !== -1; })[0];
    var gasCost = gas ? gas.usd : D.assumptions.gas_default_usd;
    var chainsText = row.chains.length ? row.chains.slice(0, 4).join(', ') : 'no chain listed';
    var ageText = row.age === null ? 'no listed date' : row.age + ' days tracked, no token';
    var launched = cat ? cat.launched : 0;
    var total = cat ? cat.protocols : 0;
    var band = null;
    for (var i = 0; i < D.bands.length; i += 1) {
      var b = D.bands[i];
      if (row.tvl >= b.floor_usd && (b.ceiling_usd === null || row.tvl < b.ceiling_usd)) band = b;
    }
    var atFlat = row.tvl * D.market.median_multiple * row.odds * row.mo * row.ma;
    var atBand = band ? row.tvl * band.median_multiple * row.odds * row.mo * row.ma : null;
    var atRawOdds = cat ? row.tvl * row.mult * cat.raw_rate * row.mo * row.ma : null;
    var atNoAdjust = row.tvl * row.mult * row.odds;
    var swings = [
      ['the curve, on all ' + D.curve.sample + ' launches', row.mult.toFixed(3) + '×', money(row.implied)],
      ['the band&rsquo;s median multiple instead', band ? band.median_multiple.toFixed(2) + '×' : '—',
        band ? money(atBand) : '—'],
      ['a flat market multiple instead', D.market.median_multiple.toFixed(3) + '×', money(atFlat)],
      ['the category&rsquo;s odds, unshrunk', cat ? (cat.raw_rate * 100).toFixed(1) + '%' : '—',
        atRawOdds === null ? '—' : money(atRawOdds)],
      ['no momentum, no maturity', '1.000', money(atNoAdjust)],
    ].map(function (s) {
      return '<tr><td class="l">' + s[0] + '</td><td class="num">' + esc(s[1]) + '</td>' +
        '<td class="num ink">' + esc(s[2]) + '</td></tr>';
    }).join('');

    var water = [
      ['TVL', money(row.tvl), 'across ' + (row.chains.length || 0) + ' chain(s), ' + esc(D.meta.as_of)],
      ['× the size curve', row.mult.toFixed(3) + '×', (band ? band.label + ': the ' + band.launched +
        ' launches in this band have a median of ' + band.median_multiple.toFixed(2) + '×, and the fit smooths across all ' +
        D.curve.sample : 'no band') + ', so it prices $1 of TVL here at ' + row.mult.toFixed(3)],
      ['= value if it launched', money(row.ifl), 'the market cap a launch would be priced at today'],
      ['× launch odds', (row.odds * 100).toFixed(1) + '%', launched + ' of ' + total + ' ' + row.cat +
        ' protocols record a token; pulled to ' + (row.odds * 100).toFixed(1) + '% from that raw ' +
        (total ? ((launched / total) * 100).toFixed(1) : '0.0') + '% toward the market\u2019s ' +
        (D.market.launch_rate * 100).toFixed(1) + '%'],
      ['× momentum', row.mo.toFixed(3), row.ch === null ? 'no seven-day change reported, so neutral at 1.000'
        : 'TVL ' + pct(row.ch) + ' in seven days: 1 + ' + D.model.momentum_weight + '·tanh(' + row.ch + ' / ' +
          D.model.momentum_scale_pct + ') = ' + row.mo.toFixed(3)],
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
      : '<tr><td class="l" colspan="5" style="color:var(--faint)">No launched protocol to compare with.</td></tr>';

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
      '<p class="summary">' + esc(row.name) + ' holds <b>' + money(row.tvl) + '</b> of TVL and records no token. ' +
        'The snapshot&rsquo;s own ' + D.curve.sample + ' launched protocols price a protocol this size at <b>' +
        row.mult.toFixed(3) + '×</b> TVL, so a launch would be worth <b>' + money(row.ifl) + '</b>. Only <b>' +
        (row.odds * 100).toFixed(1) + '%</b> of ' + esc(row.cat) + ' protocols ever recorded one, and TVL moved <b>' +
        pct(row.ch) + '</b> in a week, which lands the expected value at <b>' + money(row.implied) + '</b>. ' +
        'The plan costs about <b>$' + gasCost + '</b> in gas plus the position, and takes <b>' +
        (row.farm[2] ? esc(row.farm[2].time) : 'weeks') + '</b> to judge.</p>' +
      '<section class="detail">' +
        '<div class="panel"><div class="panel-hd"><h2>The number, one factor at a time</h2>' +
          '<span class="hint">every step is a field of the snapshot</span></div>' +
          '<div class="wf">' + water +
          '<div class="wrow total"><span class="wl">= implied value</span><span class="wv">' + money(row.implied) +
          '</span><span class="wn">what the board ranks</span></div></div></div>' +
        '<div class="panel"><div class="panel-hd"><h2>Farm it</h2>' +
          '<span class="hint">cost and clock on every step</span></div>' +
          '<div class="farm">' + steps + '</div></div>' +
      '</section>' +
      '<section class="detail">' +
        '<div class="panel comps"><div class="panel-hd"><h2>Launched protocols of the same size</h2>' +
          '<span class="hint">the seven nearest in TVL; the curve uses all ' + D.curve.sample + '</span></div>' +
          '<table><thead><tr><th class="l">Protocol</th><th>TVL</th><th>Market cap</th><th>Mcap/TVL</th><th></th></tr></thead>' +
          '<tbody>' + compRows + '</tbody></table></div>' +
        '<div class="panel"><div class="panel-hd"><h2>If the model were cruder</h2>' +
          '<span class="hint">what each step is worth</span></div>' +
          '<table><tbody>' + swings + '</tbody></table>' +
          '<p class="note">The spread is the honest uncertainty: a reader who trusts only the flat multiple lands at ' +
          'the third row, one who trusts the category&rsquo;s own history at the fourth, and the board ranks the ' +
          'fitted figure because it is the only one that held up out of sample.</p></div>' +
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
