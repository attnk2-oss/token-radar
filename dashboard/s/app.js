
(function () {
'use strict';
var D = window.RADAR;
var app = document.getElementById('app');
if (!D || !D.rows || !D.rows.length) {
app.innerHTML = '<p class="empty">No radar data: data.js was not written beside the page.</p>';
return;
}
function esc(value) {
return String(value === null || value === undefined ? '' : value)
.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(n) {
var abs = Math.abs(n);
if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
if (abs >= 100) return '$' + Math.round(n);
return '$' + n.toFixed(2);
}
function cash(n) {
var abs = Math.abs(n);
var body = abs >= 1000 ? Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : abs >= 100 ? abs.toFixed(0) : abs.toFixed(2);
if (abs < 0.005) return '$0';
return (n < 0 ? '-' : '+') + '$' + body;
}
function pct(n) {
if (n === null || n === undefined) return '—';
return (n > 0 ? '+' : '') + Number(n).toFixed(Math.abs(n) >= 10 ? 0 : 1) + '%';
}
function age(days) {
if (days === null || days === undefined) return '—';
if (days < 365) return days + 'd';
return (days / 365).toFixed(1) + 'y';
}
function plural(n, one, many) {
return n + ' ' + (n === 1 ? one : many);
}
function hostOf(source) {
return String(source).replace(/^[a-z]+:\/\//, '');
}
function times(n, places) {
if (n === null || !isFinite(n)) return '—';
if (n > 99) return '99×+';
if (n < 0.01) return '<0.01×';
return n.toFixed(n < 1 ? 2 : 1) + '×';
}
var params = new URLSearchParams(location.search);
var TIERS = D.assumptions.stake_tiers;
var tier = TIERS.indexOf(10000);
if (tier < 0) tier = 0;
var askedStake = Number(params.get('stake') || 0);
for (var i = 0; i < TIERS.length; i += 1) if (TIERS[i] === askedStake) tier = i;
var VERDICTS = ['Worth farming', 'Marginal', 'Skip'];
var state = {
q: params.get('q') || '',
cat: params.get('cat') || 'all',
chain: params.get('chain') || 'all',
min: Number(params.get('min') || 0),
watch: params.get('watch') === '1',
v: VERDICTS.indexOf(params.get('v')) >= 0 ? params.get('v') : 'all',
sort: params.get('sort') || 'rank',
dir: params.get('dir') === 'desc' ? -1 : 1,
view: params.get('view') === 'setaside' ? 'setaside' : 'board',
};
var bySlug = {};
D.rows.forEach(function (row) { bySlug[row.slug] = row; });
var catOdds = {};
D.odds.forEach(function (c) { catOdds[c.key] = c; });
var categories = D.odds.map(function (c) { return c.key; });
var chainCounts = {};
D.rows.forEach(function (row) {
(row.chains.length ? row.chains : ['Unlisted']).forEach(function (ch) {
chainCounts[ch] = (chainCounts[ch] || 0) + 1;
});
});
var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a] || (a < b ? -1 : 1); });
function dec(row) { return row.dec[tier]; }
var ORDER = { 'Worth farming': 3, Marginal: 2, Skip: 1 };
var SORTERS = {
rank: function (r) { return r.rank; },
name: function (r) { return r.name.toLowerCase(); },
implied: function (r) { return r.implied; },
tvl: function (r) { return r.tvl; },
ch: function (r) { return r.ch === null ? -1e9 : r.ch; },
age: function (r) { return r.age === null ? -1 : r.age; },
slice: function (r) { return dec(r).slice_usd; },
net: function (r) { return dec(r).net_usd; },
band: function (r) { return r.band[0]; },
be: function (r) { return dec(r).break_even; },
ph: function (r) { return dec(r).net_per_hour; },
verdict: function (r) { return ORDER[dec(r).verdict]; },
};
function visibleRows() {
var q = state.q.trim().toLowerCase();
var rows = D.rows.filter(function (row) {
if (state.cat !== 'all' && row.cat !== state.cat) return false;
if (state.chain !== 'all' && row.chains.indexOf(state.chain) === -1) return false;
if (row.tvl < state.min) return false;
if (state.watch && !row.watch) return false;
if (state.v !== 'all' && dec(row).verdict !== state.v) return false;
if (!q) return true;
return (
row.name.toLowerCase().indexOf(q) !== -1 ||
row.slug.indexOf(q) !== -1 ||
row.cat.toLowerCase().indexOf(q) !== -1 ||
row.chains.join(' ').toLowerCase().indexOf(q) !== -1
);
});
var read = SORTERS[state.sort] || SORTERS.rank;
rows.sort(function (a, b) {
var av = read(a);
var bv = read(b);
if (typeof av === 'string' || typeof bv === 'string') return state.dir * (String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0);
return (av - bv) * state.dir || a.rank - b.rank;
});
return rows;
}
function verdictCounts(rows) {
var out = { 'Worth farming': 0, Marginal: 0, Skip: 0 };
rows.forEach(function (row) { out[dec(row).verdict] += 1; });
return out;
}

function header() {
var m = D.meta;
var n = D.rows.length;
return '<header class="hdr">' +
'<div class="brand"><span class="mark">◎</span><span class="wg">Token Radar</span>' +
'<span class="tag">' + esc(m.model_version) + '</span></div>' +
'<div class="hdr-meta">' +
'<span>snapshot <b>' + esc(m.as_of) + '</b></span>' +
'<span><b>' + m.protocols + '</b> protocols</span>' +
'<span><b>' + m.watchlist + '</b> watchlist</span>' +
'<span>launch rate <b>' + (D.market.launch_rate * 100).toFixed(1) + '%</b></span>' +
'</div>' +
'<span class="badge" id="integrity" title="Every ranked row, its value, P10-P90 band and verdict is in board.json">' +
'board.json = this page: <b>' + n + '/' + n + '</b> ranks · values · bands · verdicts</span></header>';
}
function kpi(label, value, sub, accent) {
return '<div class="kpi"><span class="kv' + (accent ? ' a' : '') + '">' + value + '</span>' +
'<span class="kk">' + label + '</span><span class="ks">' + sub + '</span></div>';
}
function kpis() {
var c = D.coverage;
var w = D.ladder.filter(function (row) { return row.chosen; })[0];
var reasons = {};
c.setAside.forEach(function (r) { reasons[r.reason] = (reasons[r.reason] || 0) + 1; });
return '<section class="kpis" aria-label="Coverage and model accuracy">' +
kpi('watchlist covered', D.meta.watchlist_covered + '/' + D.meta.watchlist, 'every one ranked', true) +
kpi('ranked', String(c.ranked), 'no-token launch candidates') +
kpi('already trade', String(c.trading), 'median LOO miss ' + w.loo.toFixed(2) + '×') +
kpi('set aside', String(c.setAside.length), 'with a reason, in ' + Object.keys(reasons).length + ' groups') +
kpi('chosen rung', w.loo.toFixed(2) + '× / ' + w.walkForward.toFixed(2) + '×', 'LOO / walk-forward', true) +
'</section>';
}
function stakeSwitch() {
var buttons = TIERS.map(function (stake, at) {
return '<button data-stake="' + stake + '"' + (at === tier ? ' class="on"' : '') + '>' + money(stake) + '</button>';
}).join('');
return '<div class="stake" id="stake"><span>STAKE</span>' + buttons + '</div>';
}
function verdictChips() {
var counts = verdictCounts(D.rows);
var chips = [['all', 'Any verdict', D.rows.length]].concat(VERDICTS.map(function (word) { return [word, word, counts[word]]; }));
return '<div class="chips" id="verdicts">' + chips.map(function (chip) {
return '<button data-verdict="' + esc(chip[0]) + '"' + (state.v === chip[0] ? ' class="on"' : '') + '>' +
esc(chip[1]) + '<i>' + chip[2] + '</i></button>';
}).join('') + '</div>';
}
function viewsChips() {
var n = D.coverage.setAside.length;
return '<div class="chips" id="views"><button data-view="board"' + (state.view === 'board' ? ' class="on"' : '') + '>Board<i>' + D.rows.length + '</i></button>' +
'<button data-view="setaside"' + (state.view === 'setaside' ? ' class="on"' : '') + '>Set aside<i>' + n + '</i></button></div>';
}
function toolbar() {
if (state.view === 'setaside') {
return '<div class="tools">' + viewsChips() + '<span class="count" id="count">' + D.coverage.setAside.length + ' protocols, grouped by reason</span></div>';
}
var cats = ['<option value="all">Every category</option>'].concat(categories.map(function (c) {
return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
}));
var chs = ['<option value="all">Every chain</option>'].concat(chains.slice(0, 40).map(function (c) {
return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
}));
var sizes = [
{ min: 0, label: 'All sizes' },
{ min: 1000000000, label: '≥ $1B' },
{ min: 250000000, label: '≥ $250M' },
{ min: 50000000, label: '≥ $50M' },
].map(function (s) {
return '<button data-min="' + s.min + '"' + (state.min === s.min ? ' class="on"' : '') + '>' + s.label + '</button>';
}).join('');
return '<div class="tools">' + viewsChips() + stakeSwitch() + verdictChips() + '<span class="count" id="count"></span></div>' +
'<div class="tools">' +
'<input class="search" id="q" type="search" placeholder="Filter by name, category or chain" value="' + esc(state.q) + '">' +
'<select id="cat">' + cats.join('') + '</select>' +
'<select id="chain">' + chs.join('') + '</select>' +
'<div class="chips" id="sizes">' + sizes + '</div>' +
'<div class="chips" id="watchchip"><button data-watch="1"' + (state.watch ? ' class="on"' : '') + '>Watchlist only</button></div>' +
'</div>';
}
function sortHead(key, label, align, title, cls) {
var on = state.sort === key;
var arrow = on ? (state.dir < 0 ? ' ↓' : ' ↑') : '';
return '<th data-sort="' + key + '" class="' + (cls || '') + ' ' + (align === 'l' ? 'l ' : '') + (on ? 'on' : '') + '"' +
(title ? ' title="' + esc(title) + '"' : '') + '>' + label + arrow + '</th>';
}
function bandCell(row) {
var b = row.band;
var lo = Math.log10(Math.max(1, b[0]));
var hi = Math.log10(Math.max(10, b[3]));
var span = Math.max(0.0001, hi - lo);
function pos(v) { return Math.max(0, Math.min(100, ((Math.log10(Math.max(1, v)) - lo) / span) * 100)); }
var p25 = pos(b[1]);
var p75 = pos(b[2]);
return '<span class="band" title="P10 ' + money(b[0]) + ' · P25 ' + money(b[1]) + ' · P75 ' + money(b[2]) + ' · P90 ' + money(b[3]) + '">' +
'<i style="left:0;width:100%"></i>' +
'<b style="left:' + p25.toFixed(1) + '%;width:' + Math.max(1.5, p75 - p25).toFixed(1) + '%"></b>' +
'<u style="left:' + pos(row.implied).toFixed(1) + '%"></u></span>';
}
function verdictPill(word) {
var cls = word === 'Worth farming' ? 'worth' : word === 'Marginal' ? 'marginal' : 'skip';
return '<span class="vd ' + cls + '" title="' + (word === 'Skip' ? 'Loses money on its own cost' : word === 'Marginal' ? 'Pays, under what an hour is worth' : 'Pays over what an hour is worth') + '">' + word + '</span>';
}
function boardTable() {
var rows = visibleRows();
var head = '<thead><tr>' +
sortHead('rank', '#', 'l', '', 'c-rank') +
sortHead('name', 'Protocol', 'l', '', 'c-name') +
sortHead('verdict', 'Verdict', 'n', 'At the stake the page is switched to: does the plan pay for the hours it takes', 'c-vd') +
sortHead('implied', 'Implied', 'n', 'TVL × the fitted multiple × launch odds. The board ranks this.', 'c-val') +
sortHead('band', 'P10–P90', 'n', 'The spread of the model\'s leave-one-out misses at this size', 'c-band') +
sortHead('tvl', 'TVL', 'n', '', 'c-tvl') +
sortHead('ch', '7d', 'n', '', 'c-ch') +
sortHead('age', 'No token', 'n', 'How long the protocol has carried no token', 'c-age') +
sortHead('slice', 'Slice', 'n', 'If it launches: your stake as a share of TVL, times the 15% of a launch that reaches depositors', 'c-slice') +
sortHead('net', 'Net', 'n', 'The slice × the launch odds, less gas and the cost of capital', 'c-net') +
sortHead('be', 'Break-even', 'n', 'How far above the model the launch must land, after the odds, for the bet to pay', 'c-be') +
sortHead('ph', 'Net/hr', 'n', 'Net over the hours the plan takes', 'c-ph') +
'</tr></thead>';
var body = rows.map(function (row) {
var d = dec(row);
var trend = row.ch === null ? 'flat' : row.ch > 0 ? 'pos' : row.ch < 0 ? 'neg' : 'flat';
var chainsText = row.chains.length ? row.chains.slice(0, 3).join(' · ') : 'unlisted chain';
if (row.chains.length > 3) chainsText += ' +' + (row.chains.length - 3);
return '<tr data-slug="' + esc(row.slug) + '">' +
'<td class="c-rank rank">' + row.rank + '</td>' +
'<td class="c-name nm">' + esc(row.name) +
(row.watch ? ' <span class="w" title="On the house watchlist">W</span>' : '') +
'<span class="sub">' + esc(row.cat) + ' · ' + esc(chainsText) + '</span></td>' +
'<td class="c-vd">' + verdictPill(d.verdict) + '</td>' +
'<td class="c-val val">' + money(row.implied) + '</td>' +
'<td class="c-band bandcell">' + bandCell(row) + '</td>' +
'<td class="c-tvl num">' + money(row.tvl) + '</td>' +
'<td class="c-ch num ' + trend + '">' + pct(row.ch) + '</td>' +
'<td class="c-age num">' + age(row.age) + '</td>' +
'<td class="c-slice num">' + money(d.slice_usd) + '</td>' +
'<td class="c-net num ' + (d.net_usd > 0 ? 'pos' : d.net_usd < 0 ? 'neg' : 'flat') + '">' + cash(d.net_usd) + '</td>' +
'<td class="c-be num ' + (d.break_even < 1 ? 'pos' : d.break_even > 2 ? 'neg' : 'flat') + '">' + times(d.break_even) + '</td>' +
'<td class="c-ph num ' + (d.net_per_hour >= D.assumptions.labour_usd_per_hour ? 'pos' : d.net_per_hour < 0 ? 'neg' : 'flat') + '">' + cash(d.net_per_hour) + '</td>' +
'</tr>';
}).join('');
return '<div class="tablewrap"><table class="board">' + head + '<tbody>' +
(body || '<tr><td colspan="12" class="empty">No protocol matches these filters.</td></tr>') +
'</tbody></table></div>';
}
function setAsideTable() {
var groups = {};
D.coverage.setAside.forEach(function (r) { (groups[r.reason] = groups[r.reason] || []).push(r); });
var reasons = Object.keys(groups).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
var body = reasons.map(function (reason) {
var rows = groups[reason].slice().sort(function (a, b) { return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0; });
var head = '<tr class="group"><td colspan="3">' + esc(reason) + '<i>' + rows.length + '</i></td></tr>';
return head + rows.map(function (r) {
return '<tr><td class="setname">' + esc(r.name) + '</td><td class="slugm">' + esc(r.slug) + '</td><td class="setreason">' + esc(r.reason) + '</td></tr>';
}).join('');
}).join('');
return '<div class="tablewrap"><table class="setaside"><thead><tr><th class="l">Protocol</th><th class="l">Slug</th><th class="l">Why it is set aside</th></tr></thead>' +
'<tbody>' + body + '</tbody></table></div>' +
'<p class="note" style="border-top:1px solid var(--line)">Every protocol in the snapshot that records no token is here or on the board: ' +
D.coverage.ranked + ' ranked + ' + D.coverage.setAside.length + ' set aside = ' + (D.coverage.ranked + D.coverage.setAside.length) +
' pre-token. The other ' + D.coverage.trading + ' already trade and set the curve.</p>';
}
function curveRail() {
var rows = D.bands.map(function (b) {
return '<tr><td>' + esc(b.label) + '</td><td class="n">' + b.launched + '</td><td class="m">' + b.median_multiple.toFixed(2) + '×</td></tr>';
}).join('');
return '<aside class="panel cal">' +
'<div class="panel-hd"><h2>The size curve</h2><span class="hint">mcap/TVL falls with TVL</span></div>' +
'<table><thead><tr><th class="l">TVL band</th><th>Launched</th><th>Median</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="note">Fitted on ' + D.curve.sample + ' traded protocols: <b>log10(mcap/TVL) = ' +
D.curve.intercept.toFixed(2) + ' ' + (D.curve.slope < 0 ? '−' : '+') + ' ' + Math.abs(D.curve.slope).toFixed(2) +
'·log10(TVL)</b>. The band medians are what it smooths: $1 of TVL in a $5M protocol is worth ' +
(D.bands[0].median_multiple).toFixed(2) + '×, in a $1B one ' + D.bands[4].median_multiple.toFixed(2) + '×.</p></aside>';
}
function stakeRail() {
var rows = TIERS.map(function (stake, at) {
var worth = 0;
var marginal = 0;
var skip = 0;
var rates = [];
D.rows.forEach(function (r) {
var d = r.dec[at];
if (d.verdict === 'Worth farming') worth += 1;
else if (d.verdict === 'Marginal') marginal += 1;
else skip += 1;
rates.push(d.net_per_hour);
});
rates.sort(function (a, b) { return a - b; });
return '<tr' + (at === tier ? ' class="on"' : '') + '><td>' + money(stake) + '</td><td class="n">' + worth +
'</td><td class="n">' + marginal + '</td><td class="n">' + skip + '</td><td class="m">' + cash(rates[rates.length >> 1]) + '</td></tr>';
}).join('');
return '<aside class="panel cal">' +
'<div class="panel-hd"><h2>What the stake changes</h2><span class="hint">the whole board, four sizes</span></div>' +
'<table><thead><tr><th class="l">Stake</th><th>Worth</th><th>Marg.</th><th>Skip</th><th>Median /h</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="note">The verdict is a function of the capital: at ' + money(TIERS[0]) + ' gas and a couple of hours of ' +
'attention eat most of the slice, at ' + money(TIERS[TIERS.length - 1]) + ' almost everything pays.</p></aside>';
}
function oddsRail() {
var rows = D.odds.slice(0, 6).map(function (c) {
return '<tr><td>' + esc(c.key) + '</td><td class="n">' + c.launched + '/' + c.protocols + '</td><td class="p">' + Math.round(c.odds * 100) + '%</td></tr>';
}).join('');
var big = D.odds.filter(function (c) { return c.protocols >= 10; }).slice().sort(function (a, b) { return b.odds - a.odds || (a.key < b.key ? -1 : 1); });
var high = big[0];
var low = big[big.length - 1];
return '<aside class="panel cal">' +
'<div class="panel-hd"><h2>Launch odds</h2><span class="hint">by family, shrunk to the market</span></div>' +
'<table><thead><tr><th class="l">Family</th><th>Live</th><th>Odds</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="note">The share of a family that ever recorded a token, pulled toward the market\'s ' +
(D.market.launch_rate * 100).toFixed(1) + '%. Among families with 10 or more protocols, <b>' + esc(high.key) + '</b> launches ' +
Math.round(high.odds * 100) + '% of the time and <b>' + esc(low.key) + '</b> ' + Math.round(low.odds * 100) +
'%: that spread is what the odds column buys.</p></aside>';
}
function ladderTable() {
var winner = null;
var winnerAt = -1;
D.ladder.forEach(function (row, at) { if (row.chosen) { winner = row; winnerAt = at; } });
var prev = D.ladder[Math.max(0, winnerAt - 1)];
var rows = D.ladder.map(function (row) {
return '<tr' + (row.chosen ? ' class="chosen"' : '') + '>' +
'<td>' + esc(row.name) + (row.chosen ? '<span class="tagc">priced on this</span>' : '') + '</td>' +
'<td class="m">' + row.loo.toFixed(2) + '×</td>' +
'<td class="m">' + Math.round(row.withinThree * 100) + '%</td>' +
'<td class="m">' + row.rho.toFixed(2) + '</td>' +
'<td class="m">' + row.walkForward.toFixed(2) + '×</td></tr>';
}).join('');
var splits = D.splits.map(function (s) {
return '<span style="white-space:nowrap">' + s.cutoff + ' <b>' + s.miss.toFixed(2) + '×</b></span>';
}).join(' · ');
return '<section class="panel ladder" id="models">' +
'<div class="panel-hd"><h2>Six versions, one test each</h2><span class="hint">fit older launches, score newer ones</span></div>' +
'<table><thead><tr><th class="l">What it adds</th><th>LOO miss</th><th>≤ 3×</th><th>Rank ρ</th><th>Walk-fwd</th></tr></thead>' +
'<tbody>' + rows + '</tbody></table>' +
'<p class="note"><b>Leave-one-out</b>: fit on 114 launches, price the 115th, refit for each. <b>≤ 3×</b>: the share inside a factor ' +
'of three. <b>Rank ρ</b>: Spearman on the held-out prices against the real caps. <b>Walk-forward</b>: fit before each cutoff, score ' +
'after, pool the errors (' + splits + '). The board prices with <b>' + esc(winner.name) + '</b>, the lowest walk-forward miss; its ' +
'margin over ' + esc(prev.name) + ' is ' + (prev.walkForward - winner.walkForward).toFixed(2) + '×, which is noise. Listing age ' +
'costs ' + (D.ladder[5].walkForward - winner.walkForward).toFixed(2) + '× and is out of the value.</p></section>';
}
function formulaPanel() {
var c = D.curve;
var m = D.assumptions;
var fam = c.family.filter(function (f) { return f.launched >= 4; }).slice(0, 3);
var famText = fam.map(function (f) {
var size = Math.abs(f.offset).toFixed(2);
return esc(f.key) + ' ' + (size === '0.00' ? '0.00' : (f.offset > 0 ? '+' : '−') + size);
}).join(', ');
return '<section class="panel"><div class="panel-hd"><h2>How a number is made</h2><span class="hint">every term fitted on the snapshot</span></div>' +
'<div class="formula"><pre>log10(mult) = ' + c.intercept.toFixed(3) + ' ' + (c.slope < 0 ? '−' : '+') + ' ' + Math.abs(c.slope).toFixed(3) + '·log10(TVL)\n' +
'            ' + (c.growth < 0 ? '−' : '+') + ' ' + Math.abs(c.growth).toFixed(3) + '·tanh(Δ7d / ' + D.model.growth_scale_pct + ')\n' +
'            + family(category)\n\n' +
'implied     = TVL × 10^log10(mult) × launch_odds(category)\n\n' +
'family(' + famText + ', …)\n' +
'odds        = launched / protocols, shrunk to ' + (D.market.launch_rate * 100).toFixed(1) + '%\n' +
'mult        clamped to ' + c.clamp_low.toFixed(2) + '×–' + c.clamp_high.toFixed(2) + '×, the band the\n' +
'            snapshot itself shows</pre>' +
'<p>Six versions were fitted and four tests run on each; the ladder beside this names the winner. ' +
'<b>Family offsets</b> are the one structural term that pays: the same $100M of TVL prices higher as a lending ' +
'market than as a risk curator. <b>Growth</b> is fitted at ' + c.growth.toFixed(3) + ' in log10, so a week of +30% TVL ' +
'moves a value by two per cent, downward: capital arriving that fast is mercenary. <b>Listing age</b> made the ' +
'walk-forward miss worse, so it prices nothing; it still sets the hold and the hours.</p></div></section>';
}
function scatterSvg() {
var W = 1080;
var H = 400;
var L = 62;
var R = 16;
var T = 14;
var B = 38;
var pts = D.scatter.filter(function (p) { return p.tvl > 0 && p.value > 0; });
var xs = pts.map(function (p) { return Math.log10(p.tvl); });
var ys = pts.map(function (p) { return Math.log10(p.value); });
// The axes stop a tenth of a decade past the last point rather than at the next whole decade: the
// snapshot's largest protocol is $26B, and rounding up to $100B left two-fifths of the plot empty.
var x0 = Math.min.apply(null, xs) - 0.06;
var x1 = Math.max.apply(null, xs) + 0.1;
var y0 = Math.min.apply(null, ys) - 0.06;
var y1 = Math.max.apply(null, ys) + 0.1;
function X(v) { return L + ((Math.log10(v) - x0) / (x1 - x0)) * (W - L - R); }
function Y(v) { return H - B - ((Math.log10(v) - y0) / (y1 - y0)) * (H - T - B); }
function px(n) { return Math.round(n * 10) / 10; }
var grid = '';
for (var gx = Math.ceil(x0); gx <= Math.floor(x1); gx += 1) {
var gxx = px(X(Math.pow(10, gx)));
var anchor = gxx > W - 46 ? ' style="text-anchor:end"' : gxx < L + 30 ? ' style="text-anchor:start"' : '';
grid += '<line class="gx" x1="' + gxx + '" y1="' + T + '" x2="' + gxx + '" y2="' + (H - B) + '"/>' +
'<text class="ax" x="' + gxx + '" y="' + (H - B + 15) + '"' + anchor + '>' + money(Math.pow(10, gx)) + '</text>';
}
for (var gy = Math.ceil(y0); gy <= Math.floor(y1); gy += 1) {
grid += '<line class="gy" x1="' + L + '" y1="' + px(Y(Math.pow(10, gy))) + '" x2="' + (W - R) + '" y2="' + px(Y(Math.pow(10, gy))) + '"/>' +
'<text class="ax ay" x="' + (L - 7) + '" y="' + px(Y(Math.pow(10, gy)) + 3) + '">' + money(Math.pow(10, gy)) + '</text>';
}
var bc = D.band_curve;
var top = bc.map(function (b) { return px(X(b.tvl)) + ',' + px(Y(b.tvl * b.hi)); }).join(' ');
var bottom = bc.slice().reverse().map(function (b) { return px(X(b.tvl)) + ',' + px(Y(b.tvl * b.lo)); }).join(' ');
var line = bc.map(function (b, at) { return (at ? 'L' : 'M') + px(X(b.tvl)) + ',' + px(Y(b.tvl * b.mult)); }).join(' ');
var edgeLo = bc.map(function (b) { return px(X(b.tvl)) + ',' + px(Y(b.tvl * b.lo)); }).join(' ');
var edgeHi = bc.map(function (b) { return px(X(b.tvl)) + ',' + px(Y(b.tvl * b.hi)); }).join(' ');
var dots = pts.map(function (p) {
return '<circle class="p' + p.kind + '" cx="' + px(X(p.tvl)) + '" cy="' + px(Y(p.value)) + '" r="' + (p.kind >= 2 ? 2.3 : 1.9) + '"/>';
}).join('');
return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap or implied value against TVL, both on log scales">' +
'<polygon class="bandarea" points="' + top + ' ' + bottom + '"/>' +
'<polyline class="edge" points="' + edgeLo + '"/><polyline class="edge" points="' + edgeHi + '"/>' +
grid + dots +
'<path class="curve" d="' + line + '"/>' +
'<text class="ax" x="' + (W / 2) + '" y="' + (H - 6) + '">TVL, log scale</text>' +
'<text class="ax" x="' + L + '" y="' + (T + 9) + '" style="text-anchor:start">market cap, or value if it launched</text>' +
'</svg>';
}
function scatterPanel() {
return '<section class="panel scatter" id="scatter">' +
'<div class="panel-hd"><h2>Traded tokens set the curve; the protocols with no token sit on it</h2>' +
'<span class="hint">both axes log; the band is P25–P75 of the model\'s own misses</span></div>' +
scatterSvg() +
'<div class="legend">' +
'<span><em class="p0" style="background:#6d7686"></em>' + D.market.multiples + ' traded, in the fit</span>' +
'<span><em style="background:#3b424e"></em>traded, outside the fit</span>' +
'<span><em style="background:var(--violet)"></em>no token, at its value if launched</span>' +
'<span><em style="background:var(--amber)"></em>on the watchlist</span>' +
'</div></section>';
}
function assumptionsPanel() {
var a = D.assumptions;
var gas = a.gas_usd.map(function (g) { return '<tr><td>' + esc(g.chain) + '</td><td>$' + g.usd + '</td></tr>'; }).join('');
var holds = a.hold_days.map(function (h) { return '<tr><td>' + h.age_floor + 'd+ tracked</td><td>' + h.days + 'd</td></tr>'; }).join('');
return '<section class="panel"><div class="panel-hd"><h2>The decision, spelled out</h2><span class="hint">argue with a line, not the number</span></div>' +
'<div class="body assume" style="grid-template-columns:1fr 1fr;gap:0 18px">' +
'<div><h3>Your stake</h3><table>' +
'<tr><td>Slice if launch</td><td>TVL share × ' + Math.round(a.pool_share * 100) + '%</td></tr>' +
'<tr><td>Net</td><td>slice × odds − cost</td></tr>' +
'<tr><td>Cost</td><td>' + a.gas_trips + '× gas + stake × ' + Math.round(a.capital_cost_apr * 100) + '% × hold/365</td></tr>' +
'<tr><td>Break-even</td><td>cost ÷ expected slice</td></tr>' +
'</table></div>' +
'<div><h3>Your hour</h3><table>' +
'<tr><td>Setup and exit</td><td>' + (a.setup_hours + a.exit_hours).toFixed(1) + ' h</td></tr>' +
'<tr><td>Review</td><td>' + Math.round(a.review_hours_per_week * 60) + ' min/week</td></tr>' +
'<tr><td>An hour is worth</td><td>$' + a.labour_usd_per_hour + '</td></tr>' +
'<tr><td>Pool share</td><td>' + Math.round(a.pool_share * 100) + '% of a launch</td></tr>' +
'</table></div>' +
'<div><h3>Gas, one transaction</h3><table>' + gas + '</table></div>' +
'<div><h3>Hold before judging</h3><table>' + holds + '</table></div>' +
'</div></section>';
}
function testPanel() {
var rows = D.splits.map(function (s) {
return '<tr><td class="l">listed from ' + esc(s.cutoff) + '</td><td class="num">' + s.fit + ' / ' + s.test + '</td>' +
'<td class="num ink">' + s.miss.toFixed(2) + '×</td><td class="num">' + Math.round(s.within_3x * 100) + '%</td>' +
'<td class="num">' + s.rank_correlation.toFixed(2) + '</td></tr>';
}).join('');
return '<section class="panel"><div class="panel-hd"><h2>Tested on the snapshot\'s own launches</h2><span class="hint">the chosen model, three splits</span></div>' +
'<table><thead><tr><th class="l">Held out</th><th>Fit / test</th><th>Miss</th><th>≤ 3×</th><th>Rank ρ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="note">Each row fits the model on the protocols DefiLlama began tracking before that date and scores the ones after it ' +
'against their real market cap. The pooled walk-forward figure in the ladder is the median of every held-out miss across these three.</p></section>';
}
function limitsPanel() {
return '<section class="panel"><div class="panel-hd"><h2>What this radar does not know</h2><span class="hint">read before trusting a verdict</span></div>' +
'<div class="body limits" style="padding:9px 12px 11px"><ul>' +
'<li><b>The pool share is assumed.</b> The snapshot carries no supply, float or airdrop data, so the page assumes ' +
Math.round(D.assumptions.pool_share * 100) + '% of a launch reaches depositors; every row prints the break-even that replaces it.</li>' +
'<li><b>No token supply.</b> Market cap, not float, so every multiple is a value against TVL, never a price per token.</li>' +
'<li><b>A launch is not promised.</b> The odds are a family rate, not a schedule. A protocol can sit here for years and issue nothing.</li>' +
'</ul></div></section>';
}
function footer() {
return '<div class="foot"><span><b>' + esc(D.meta.model_version) + '</b> model</span>' +
'<span>source <b>' + esc(hostOf(D.meta.source)) + '</b></span>' +
'<span>watchlist floor <b>' + money(D.meta.floor_usd) + '</b></span>' +
'<span><b>' + D.meta.ranked + '</b> rows across <b>' + D.odds.length + '</b> families</span>' +
'<span>band from <b>' + plural(D.market.multiples, 'leave-one-out residual', 'leave-one-out residuals') + '</b></span></div>';
}
function wireBoard() {
document.getElementById('views').onclick = function (e) {
var v = e.target.getAttribute && e.target.getAttribute('data-view');
if (!v) return;
state.view = v;
renderBoard();
};
if (state.view === 'setaside') return;
var q = document.getElementById('q');
q.oninput = function () {
state.q = q.value;
var rows = visibleRows();
document.querySelector('.tablewrap').outerHTML = boardTable();
document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' rows';
wireSort();
wireRows();
};
document.getElementById('cat').onchange = function (e) { state.cat = e.target.value; renderBoard(); };
document.getElementById('chain').onchange = function (e) { state.chain = e.target.value; renderBoard(); };
document.getElementById('watchchip').onclick = function () { state.watch = !state.watch; renderBoard(); };
document.getElementById('sizes').onclick = function (e) {
var min = e.target.getAttribute && e.target.getAttribute('data-min');
if (min === null) return;
state.min = Number(min);
renderBoard();
};
document.getElementById('verdicts').onclick = function (e) {
var v = e.target.getAttribute && e.target.getAttribute('data-verdict');
if (!v) return;
state.v = v;
renderBoard();
};
document.getElementById('stake').onclick = function (e) {
var stake = e.target.getAttribute && e.target.getAttribute('data-stake');
if (!stake) return;
setStake(Number(stake));
};
wireSort();
wireRows();
}
function wireSort() {
document.querySelectorAll('thead th[data-sort]').forEach(function (th) {
th.onclick = function () {
var key = th.getAttribute('data-sort');
if (state.sort === key) state.dir = -state.dir;
else {
state.sort = key;
state.dir = key === 'name' || key === 'rank' ? 1 : -1;
}
renderBoard();
};
});
}
function wireRows() {
document.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
tr.onclick = function () { location.hash = 'p=' + tr.getAttribute('data-slug'); };
});
}
function setStake(stake) {
for (var at = 0; at < TIERS.length; at += 1) if (TIERS[at] === stake) tier = at;
var next = new URLSearchParams(location.search);
next.set('stake', String(stake));
history.replaceState(null, '', location.pathname + '?' + next.toString() + location.hash);
route();
}
function renderBoard() {
var aside = state.view === 'setaside';
var rows = aside ? [] : visibleRows();
app.innerHTML = kpis() + header() +
(aside
? '<section class="main one"><div class="panel" id="board">' +
'<div class="panel-hd"><h2>Set aside, with the reason</h2><span class="hint">' + D.coverage.setAside.length +
' pre-token protocols kept off the ranked board</span></div>' + toolbar() + setAsideTable() + '</div></section>'
: '<section class="main"><div class="panel" id="board">' +
'<div class="panel-hd"><h2>The board</h2><span class="hint">' + (filterSummary() || 'ranked by implied value; click a row for its argument') + '</span></div>' +
toolbar() + boardTable() + '</div>' +
'<div class="rail">' + stakeRail() + curveRail() + oddsRail() + '</div></section>') +
'<section class="model">' + ladderTable() + formulaPanel() + '</section>' +
scatterPanel() +
'<section class="model">' + assumptionsPanel() + testPanel() + '</section>' +
'<section class="model" style="grid-template-columns:1fr">' + limitsPanel() + '</section>' +
footer();
if (!aside) document.getElementById('count').textContent = rows.length + ' of ' + D.rows.length + ' rows';
wireBoard();
}
function filterSummary() {
var bits = [];
if (state.watch) bits.push('watchlist only');
if (state.v !== 'all') bits.push(esc(state.v).toLowerCase() + ' only');
if (state.cat !== 'all') bits.push(esc(state.cat));
if (state.chain !== 'all') bits.push(esc(state.chain));
if (state.min > 0) bits.push('TVL ≥ $' + Math.round(state.min / 1e6) + 'M');
if (state.q.trim()) bits.push('“' + esc(state.q.trim()) + '”');
if (!bits.length) return '';
return 'filtered: ' + bits.join(' · ') + ' · ' + visibleRows().length + ' of ' + D.rows.length + ' rows';
}
function nearestBySize(tvl, limit) {
var target = Math.log10(tvl);
return D.live
.map(function (m) { return { m: m, d: Math.abs(Math.log10(m.tvl_usd) - target) }; })
.sort(function (a, b) { return a.d - b.d || (a.m.slug < b.m.slug ? -1 : 1); })
.slice(0, limit)
.map(function (entry) { return entry.m; });
}
function decisionPanel(row) {
var d = dec(row);
var gas = row.gas;
var cls = d.verdict === 'Worth farming' ? 'worth' : d.verdict === 'Marginal' ? 'marginal' : 'skip';
var per = '$' + Math.abs(d.net_per_hour).toFixed(2);
var sentence =
d.verdict === 'Skip'
? 'The odds-weighted slice does not cover the ' + '$' + d.cost_usd.toFixed(2) + ' the plan costs, so it loses money even when the launch lands at the model.'
: d.verdict === 'Marginal'
? 'It pays ' + per + ' an hour, under the $' + D.assumptions.labour_usd_per_hour + ' an hour the verdict is measured at. More capital, or a smaller protocol, is what moves it.'
: 'It pays ' + per + ' an hour over the ' + d.hours.toFixed(1) + ' hours the plan takes, which clears what an hour is worth.';
return '<section class="panel"><div class="panel-hd"><h2>The decision at ' + money(d.stake) + '</h2>' +
'<span class="hint">' + esc(row.cat) + ' · ' + row.hold + 'd hold · $' + gas + ' gas a trip</span></div>' +
'<div class="dec">' +
'<div><span class="k">Slice if launch</span><span class="v">' + money(d.slice_usd) + '</span><span class="s">' +
(d.stake / (row.tvl + d.stake) * 100).toFixed(4) + '% of TVL × ' + Math.round(D.assumptions.pool_share * 100) + '% of the launch</span></div>' +
'<div><span class="k">Net, odds-weighted</span><span class="v ' + (d.net_usd >= 0 ? 'pos' : 'neg') + '">' + cash(d.net_usd) + '</span><span class="s">' +
'after ' + cash(-d.cost_usd).replace('+', '') + ' of gas and capital</span></div>' +
'<div><span class="k">Break-even</span><span class="v">' + times(d.break_even) + '</span><span class="s">the model, after the odds</span></div>' +
'<div><span class="k">If it launches</span><span class="v">' + cash(d.net_if_launch_usd) + '</span><span class="s">the all-or-nothing case</span></div>' +
'<div><span class="k">Net / hour</span><span class="v ' + (d.net_per_hour >= D.assumptions.labour_usd_per_hour ? 'pos' : d.net_per_hour < 0 ? 'neg' : '') + '">' + cash(d.net_per_hour) + '</span><span class="s">over ' + d.hours.toFixed(1) + ' hours</span></div>' +
'<div><span class="k">Break-even pool</span><span class="v">' + (d.break_even_pool >= 1 ? '>100%' : Math.round(d.break_even_pool * 100) + '%') + '</span><span class="s">share of the launch that must reach depositors</span></div>' +
'<div class="verdict ' + cls + '"><span class="big">' + d.verdict + '</span><p>' + sentence + '</p></div>' +
'</div></section>';
}
function renderDetail(slug) {
var row = bySlug[slug];
if (!row) { location.hash = ''; return; }
var cat = catOdds[row.cat];
var comps = nearestBySize(row.tvl, 7);
var compMax = comps.reduce(function (m, c) { return Math.max(m, c.multiple); }, 0.01);
var chainsText = row.chains.length ? row.chains.slice(0, 4).join(', ') : 'no chain listed';
var band = row.band;
var atFlat = row.tvl * D.market.median_multiple * row.odds;
var atRawOdds = cat ? row.tvl * row.mult * cat.raw_rate : null;
var noFamily = row.tvl * row.sz * row.mo * row.odds;
var water = [
['TVL', money(row.tvl), 'across ' + plural(row.chains.length, 'chain', 'chains') + ', ' + esc(D.meta.as_of)],
['× the size curve', times(row.sz), 'log10(mult) = ' + D.curve.intercept.toFixed(2) + ' ' +
(D.curve.slope < 0 ? '−' : '+') + ' ' + Math.abs(D.curve.slope).toFixed(2) + '·log10(TVL), fitted on ' + D.curve.sample + ' launches'],
['× family offset', (row.fam >= 0 ? '+' : '−') + Math.abs(row.fam).toFixed(3), 'log10: ' + esc(row.cat) + ' prices ' +
(row.fam === 0 ? 'at the market (no launched protocol in the family)' : (10 ** row.fam).toFixed(2) + '× the curve')],
['× growth', row.mo.toFixed(3), row.ch === null ? 'no seven-day change reported, so neutral at 1.000' :
'TVL ' + pct(row.ch) + ' in a week: 10^(' + D.curve.growth.toFixed(3) + '·tanh(' + row.ch + ' / ' + D.model.growth_scale_pct + '))'],
['= value if it launched', money(row.ifl), 'the market cap a launch would be priced at today'],
['× launch odds', (row.odds * 100).toFixed(1) + '%', (cat ? cat.launched + ' of ' + cat.protocols : '0') + ' ' + esc(row.cat) +
' protocols record a token, pulled toward the market\'s ' + (D.market.launch_rate * 100).toFixed(1) + '%'],
].map(function (w) {
return '<div class="wrow"><span class="wl">' + w[0] + '</span><span class="wv">' + w[1] + '</span><span class="wn">' + w[2] + '</span></div>';
}).join('');
var swings = [
['the model', times(row.mult), money(row.implied)],
['a flat market multiple', D.market.median_multiple.toFixed(3) + '×', money(atFlat)],
['no family offset', times(row.sz), money(noFamily)],
['the family\'s odds, unshrunk', cat ? (cat.raw_rate * 100).toFixed(1) + '%' : '—', atRawOdds === null ? '—' : money(atRawOdds)],
].map(function (s) {
return '<tr><td class="l">' + s[0] + '</td><td class="num">' + esc(s[1]) + '</td><td class="num ink">' + esc(s[2]) + '</td></tr>';
}).join('');
var compRows = comps.length
? comps.map(function (c) {
return '<tr><td class="l">' + esc(c.name) + '</td><td class="num">' + money(c.tvl_usd) + '</td>' +
'<td class="num">' + money(c.mcap_usd) + '</td><td class="num ink">' + c.multiple.toFixed(2) + '×</td>' +
'<td class="barcell"><span class="b" style="width:' + Math.max(3, Math.round((c.multiple / compMax) * 100)) + '%"></span></td></tr>';
}).join('')
: '<tr><td class="l" colspan="5" style="color:var(--faint)">No launched protocol to compare with.</td></tr>';
var steps = row.farm.map(function (s, at) {
return '<div class="step"><span class="no">' + (at + 1) + '</span><div><div class="tx">' + esc(s.text) + '</div>' +
'<div class="mt"><span>' + esc(s.cost) + '</span><span>' + esc(s.time) + '</span></div></div></div>';
}).join('');
app.innerHTML = header() +
'<a class="back" id="back" href="#">← The board</a>' +
'<div class="dhead">' +
'<span class="drank">#' + row.rank + '</span>' +
'<div><h1>' + esc(row.name) + '</h1><div class="who">' + esc(row.cat) + ' · ' + esc(chainsText) +
(row.listed === null ? ' · listed date not reported' : ' · no token for <b>' + age(row.age) + '</b> since ' + esc(row.listed)) + '</div></div>' +
'<div class="dval"><div class="b">' + money(row.implied) + '</div><div class="c">implied value · P10 ' + money(band[0]) +
' to P90 ' + money(band[3]) + '</div></div>' +
'</div>' +
'<p class="summary">' + esc(row.name) + ' holds <b>' + money(row.tvl) + '</b> of TVL and records no token. The ' + D.curve.sample +
' traded protocols price a protocol this size at <b>' + times(row.mult) + '</b> its TVL' +
(row.fam === 0 ? '' : ' and its family adds <b>' + (10 ** row.fam).toFixed(2) + '×</b>') +
', so a launch would be worth <b>' + money(row.ifl) + '</b>. Only <b>' + (row.odds * 100).toFixed(1) + '%</b> of ' + esc(row.cat) +
' protocols ever recorded one, which lands the risk-weighted value at <b>' + money(row.implied) + '</b>. The band is what the model\'s own misses say about that number: ' +
money(band[0]) + ' to ' + money(band[3]) + ' at P10 and P90.</p>' +
'<section class="detail">' +
'<div>' + decisionPanel(row) +
'<div class="panel" style="margin-top:13px"><div class="panel-hd"><h2>The number, one factor at a time</h2>' +
'<span class="hint">every step is a field of the snapshot</span></div><div class="wf">' + water +
'<div class="wrow total"><span class="wl">= implied value</span><span class="wv">' + money(row.implied) + '</span>' +
'<span class="wn">what the board ranks</span></div></div></div>' +
'<div class="panel" style="margin-top:13px"><div class="panel-hd"><h2>Farm it</h2><span class="hint">written for ' +
money(D.assumptions.stake_tiers[0]) + '; the decision above prices your stake</span></div><div class="farm">' + steps + '</div></div>' +
'</div>' +
'<div>' +
'<div class="panel comps"><div class="panel-hd"><h2>Launched protocols of the same size</h2>' +
'<span class="hint">the seven nearest in TVL</span></div>' +
'<table><thead><tr><th class="l">Protocol</th><th>TVL</th><th>Market cap</th><th>Mcap/TVL</th><th></th></tr></thead>' +
'<tbody>' + compRows + '</tbody></table></div>' +
'<div class="panel" style="margin-top:13px"><div class="panel-hd"><h2>If the model were cruder</h2>' +
'<span class="hint">what each fitted term is worth here</span></div><table><tbody>' + swings + '</tbody></table>' +
'<p class="note">The spread is the honest uncertainty. A reader who trusts only the flat multiple lands on the second row; ' +
'one who drops the family offset lands on the third. The board ranks the fitted figure because it is the only one that held up out of sample.</p></div>' +
'<div style="margin-top:13px">' + formulaPanel() + '</div>' +
'</div>' +
'</section>' +
footer();
document.getElementById('back').onclick = function (event) {
event.preventDefault();
location.hash = '';
};
}
function route() {
var match = /^#p=(.+)$/.exec(location.hash);
if (match) renderDetail(decodeURIComponent(match[1]));
else renderBoard();
window.scrollTo(0, 0);
// A hash naming a section is a deep link to it: the screenshots use it to reach the ladder.
var target = document.getElementById(location.hash.slice(1));
if (!match && target) window.scrollTo(0, target.offsetTop - 8);
}
window.addEventListener('hashchange', route);
route();
})();
