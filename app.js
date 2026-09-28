// Creative style ROAS review. Synthetic, deterministic data: one row per
// generation style and channel for the last 30 days. Everything on the page
// is computed from CELLS, nothing downstream is hardcoded.

const CHANNELS = ['Meta', 'TikTok', 'YouTube Shorts', 'Snap'];
// Share of each style's spend, and channel effects on CTR, CVR, CPM, fatigue speed
const CH_FX = {
  'Meta':           { share: .42, ctr: 1.00, cvr: 1.10, cpm: 12.0, fade: 1.00 },
  'TikTok':         { share: .30, ctr: 1.25, cvr: 0.85, cpm:  9.0, fade: 1.35 },
  'YouTube Shorts': { share: .16, ctr: 0.72, cvr: 1.05, cpm: 10.0, fade: 0.80 },
  'Snap':           { share: .12, ctr: 1.10, cvr: 0.80, cpm:  7.5, fade: 1.15 },
};
const AOV = 62; // average order value, dollars

// Per style: 30 day spend, base CTR and CVR (percent), week 4 ROAS as a share of week 1,
// and a TikTok affinity multiplier on conversion (trend driven formats convert better there)
const STYLES = [
  { name: 'UGC talking head avatar', spend: 182000, ctr: 1.50, cvr: 2.95, hold: 0.78, tt: 1.05 },
  { name: 'Product hero render',     spend:  96000, ctr: 0.95, cvr: 3.40, hold: 0.92, tt: 0.85 },
  { name: 'Cinematic text to video', spend: 214000, ctr: 1.85, cvr: 1.25, hold: 0.85, tt: 0.95 },
  { name: 'Image to video animate',  spend: 128000, ctr: 1.30, cvr: 2.60, hold: 0.88, tt: 1.00 },
  { name: 'Before and after',        spend:  74000, ctr: 1.45, cvr: 3.55, hold: 0.81, tt: 1.10 },
  { name: 'Viral effect template',   spend: 158000, ctr: 2.20, cvr: 0.98, hold: 0.62, tt: 1.25 },
  { name: 'Static AI image',         spend:  62000, ctr: 0.70, cvr: 2.25, hold: 0.95, tt: 0.70 },
  { name: 'Meme remix',              spend:  86000, ctr: 1.95, cvr: 1.18, hold: 0.66, tt: 1.20 },
];

const jitter = (i, j, k) => (((i * 7 + j * 13 + k * 5) % 11) - 5) / 5; // deterministic, in [-1, 1]

const CELLS = [];
STYLES.forEach((s, i) => {
  CHANNELS.forEach((ch, j) => {
    const fx = CH_FX[ch];
    const spend = s.spend * fx.share;
    const ctr = s.ctr * fx.ctr * (1 + jitter(i, j, 1) * 0.06) / 100;
    const cvr = s.cvr * fx.cvr * (ch === 'TikTok' ? s.tt : 1) * (1 + jitter(i, j, 2) * 0.07) / 100;
    const impressions = spend / fx.cpm * 1000;
    const clicks = impressions * ctr;
    const conversions = clicks * cvr;
    const hold = Math.pow(s.hold, fx.fade);
    CELLS.push({ style: s.name, channel: ch, spend, impressions, clicks, conversions, revenue: conversions * AOV, hold });
  });
});

const state = { channel: 'All channels', metric: 'roas', floor: 1.5, realloc: 60, eff: 75, test: 15, sort: { col: 'rank', dir: 1 } };

function aggregate() {
  const cells = state.channel === 'All channels' ? CELLS : CELLS.filter(c => c.channel === state.channel);
  const rows = STYLES.map(s => {
    const cs = cells.filter(c => c.style === s.name);
    const sum = f => cs.reduce((a, c) => a + c[f], 0);
    const spend = sum('spend'), imp = sum('impressions'), clicks = sum('clicks'), conv = sum('conversions'), revenue = sum('revenue');
    const hold = cs.reduce((a, c) => a + c.hold * c.spend, 0) / spend;
    return { name: s.name, spend, imp, clicks, conv, revenue, ctr: clicks / imp, cvr: conv / clicks, roas: revenue / spend, cpa: spend / conv, decay: 1 - hold, hold };
  });
  const avgCtr = rows.reduce((a, r) => a + r.clicks, 0) / rows.reduce((a, r) => a + r.imp, 0);
  rows.forEach(r => {
    r.below = r.roas < state.floor;
    r.risk = r.below ? r.spend * (state.floor - r.roas) : 0;
    if (r.below && r.ctr > avgCtr) r.action = 'Rework offer, keep hook';
    else if (r.below) r.action = 'Retire style';
    else if (r.decay >= 0.28) r.action = 'Refresh creative';
    else if (r.roas >= state.floor * 1.25) r.action = 'Scale';
    else r.action = 'Hold';
  });
  const ranked = [...rows].sort((a, b) => b.risk - a.risk || a.roas - b.roas);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return { rows, ranked, avgCtr };
}

const $ = id => document.getElementById(id);
const F = Viz.fmt;
const METRICS = [
  { value: 'roas', label: 'ROAS', title: 'ROAS by creative style', fmt: v => v.toFixed(2) + 'x', sub: 'Revenue per dollar of spend, last 30 days' },
  { value: 'ctr', label: 'CTR', title: 'Click through rate by creative style', fmt: v => (v * 100).toFixed(2) + '%', sub: 'Clicks per impression, last 30 days' },
  { value: 'cpa', label: 'CPA', title: 'Cost per acquisition by creative style', fmt: v => '$' + v.toFixed(0), sub: 'Spend per conversion, last 30 days' },
  { value: 'decay', label: 'Fatigue', title: 'ROAS decay from week 1 to week 4', fmt: v => (v * 100).toFixed(0) + '%', sub: 'How much a creative loses by its fourth week in market' },
];

function blendedAt(rows, reallocPct) {
  const below = rows.filter(r => r.below);
  const scale = rows.filter(r => r.action === 'Scale');
  const receivers = scale.length ? scale : rows.filter(r => !r.below).sort((a, b) => b.roas - a.roas).slice(0, 2);
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const baseRev = rows.reduce((a, r) => a + r.revenue, 0);
  const moved = below.reduce((a, r) => a + r.spend, 0) * reallocPct / 100;
  const lost = below.reduce((a, r) => a + r.spend * reallocPct / 100 * r.roas, 0);
  const testBudget = moved * state.test / 100;
  const toScale = moved - testBudget;
  const recvSpend = receivers.reduce((a, r) => a + r.spend, 0) || 1;
  // Saturating response: the first extra dollar earns eff x the style's ROAS, later dollars earn less
  const gained = receivers.reduce((a, r) => { const x = toScale * (r.spend / recvSpend); return a + r.roas * state.eff / 100 * r.spend * Math.log(1 + x / r.spend); }, 0);
  const testRev = testBudget * (baseRev / totalSpend) * 0.8; // new styles assumed to earn 80% of the blended average while learning
  const newRev = baseRev - lost + gained + testRev;
  return { moved, testBudget, toScale, receivers, baseRev, newRev, baseRoas: baseRev / totalSpend, newRoas: newRev / totalSpend, delta: newRev - baseRev };
}

function render() {
  const { rows, ranked, avgCtr } = aggregate();
  const c1 = Viz.css('--viz-1'), c2 = Viz.css('--viz-2');
  const m = METRICS.find(x => x.value === state.metric);
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
  const below = rows.filter(r => r.below);
  const imp = blendedAt(rows, state.realloc);

  $('kpis').innerHTML = `
    <div class="stat"><div class="label">Ad spend under management</div><div class="num">${F.usd(totalSpend)}</div><div class="desc">Last 30 days, ${state.channel === 'All channels' ? 'all channels' : state.channel}</div></div>
    <div class="stat"><div class="label">Blended ROAS</div><div class="num">${(totalRev / totalSpend).toFixed(2)}x</div><div class="desc">${F.usd(totalRev)} attributed revenue</div></div>
    <div class="stat"><div class="label">Styles below floor</div><div class="num">${below.length} of ${rows.length}</div><div class="desc">${(below.reduce((a, r) => a + r.spend, 0) / totalSpend * 100).toFixed(0)}% of spend sits in them</div></div>
    <div class="stat"><div class="label">Projected lift</div><div class="num">${imp.delta >= 0 ? '+' : ''}${F.usd(imp.delta)}</div><div class="desc">Monthly revenue at the plan below, ROAS ${imp.baseRoas.toFixed(2)}x to ${imp.newRoas.toFixed(2)}x</div></div>`;

  $('barTitle').textContent = m.title;
  $('barSub').textContent = m.sub + ', ' + (state.channel === 'All channels' ? 'all channels' : state.channel);
  const byMetric = [...rows].sort((a, b) => state.metric === 'roas' ? a.roas - b.roas : b[state.metric] - a[state.metric]);
  Viz.hbar($('barChart'), {
    rows: byMetric.map(r => ({
      label: r.name, value: r[state.metric], color: r.below ? c2 : c1,
      text: m.fmt(r[state.metric]) + (r.below ? '  ▲' : ''),
      tip: Viz.tipHtml(r.name, [['Spend', F.usd(r.spend)], ['ROAS', r.roas.toFixed(2) + 'x'], ['CTR', F.pct(r.ctr, 2)], ['CVR', F.pct(r.cvr, 2)], ['CPA', '$' + r.cpa.toFixed(0)], ['Wk 1 to 4 decay', F.pct(r.decay, 0)]]),
    })),
    ref: state.metric === 'roas' ? { value: state.floor, label: 'floor ' + state.floor.toFixed(2) + 'x' } : undefined,
    fmt: m.fmt, axisFmt: state.metric === 'ctr' ? v => (v * 100).toFixed(1) + '%' : state.metric === 'decay' ? v => (v * 100).toFixed(0) + '%' : m.fmt,
  });
  $('barLegend').innerHTML = `<span><i class="sw c1"></i>At or above floor</span><span><i class="sw c2"></i>Below floor, flagged &#9650;</span>${state.metric === 'roas' ? '<span><i class="sw" style="background:var(--accent-2);width:2px;height:12px;border-radius:0"></i>ROAS floor</span>' : ''}`;

  const maxSpend = Math.max(...rows.map(r => r.spend));
  const topCtr = [...rows].sort((a, b) => b.ctr - a.ctr)[0];
  const topRoas = [...rows].sort((a, b) => b.roas - a.roas)[0];
  Viz.scatter($('scatter'), {
    points: rows.map(r => ({
      x: r.ctr * 100, y: r.roas, r: 5 + 13 * Math.sqrt(r.spend / maxSpend), color: r.below ? c2 : c1,
      label: r.name, showLabel: r === topCtr || r === topRoas || r.rank === 1,
      tip: Viz.tipHtml(r.name, [['CTR', F.pct(r.ctr, 2)], ['ROAS', r.roas.toFixed(2) + 'x'], ['Spend', F.usd(r.spend)], ['Action', r.action]]),
    })),
    xLabel: 'Click through rate', yLabel: 'ROAS', xFmt: v => v + '%', yFmt: v => v + 'x',
    refY: { value: state.floor, label: 'floor' },
  });

  renderTable(rows, imp);
  renderFindings(rows, ranked, avgCtr);
  renderActions(rows, ranked, imp);
  renderImpact(rows, imp);
}

function renderTable(rows, imp) {
  const sorted = Viz.sortRows(rows, state.sort);
  const maxSpend = Math.max(...rows.map(r => r.spend));
  const recv = new Set(imp.receivers.map(r => r.name));
  const cls = a => a === 'Scale' ? 'good' : a === 'Hold' ? 'info' : a === 'Refresh creative' ? 'alt' : 'flag';
  $('rankBody').innerHTML = sorted.map(r => `
    <tr class="${recv.has(r.name) ? 'selected' : ''}">
      <td class="num rank">${r.rank}</td>
      <td class="name">${r.name}</td>
      <td class="num"><span class="bar-cell" style="width:${(r.spend / maxSpend * 50).toFixed(0)}px"></span>${F.usd(r.spend)}</td>
      <td class="num">${F.pct(r.ctr, 2)}</td>
      <td class="num">${F.pct(r.cvr, 2)}</td>
      <td class="num">${r.roas.toFixed(2)}x</td>
      <td class="num">${F.pct(r.decay, 0)}</td>
      <td><span class="tag ${cls(r.action)}">${r.below ? '&#9650; ' : ''}${r.action}</span></td>
    </tr>`).join('');
  Viz.markSorted($('rankTable'), state.sort);
}

// Spearman rank correlation
function spearman(xs, ys) {
  const rank = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; };
  return Viz.pearson(rank(xs), rank(ys));
}

function renderFindings(rows, ranked, avgCtr) {
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const rho = spearman(rows.map(r => r.ctr), rows.map(r => r.roas));
  const byCtr = [...rows].sort((a, b) => b.ctr - a.ctr);
  const byRoas = [...rows].sort((a, b) => b.roas - a.roas);
  const ctrLeader = byCtr[0];
  const ctrLeaderRoasRank = byRoas.indexOf(ctrLeader) + 1;
  const below = rows.filter(r => r.below);
  const belowShare = below.reduce((a, r) => a + r.spend, 0) / totalSpend;
  const belowRevShare = below.reduce((a, r) => a + r.revenue, 0) / rows.reduce((a, r) => a + r.revenue, 0);
  const fastest = [...rows].sort((a, b) => b.decay - a.decay)[0];
  const wk1 = fastest.roas * 2 / (1 + fastest.hold), wk4 = wk1 * fastest.hold;

  // Channel split for the best style
  const best = byRoas[0];
  const chRoas = CHANNELS.map(ch => { const c = CELLS.find(x => x.style === best.name && x.channel === ch); return { ch, roas: c.revenue / c.spend }; }).sort((a, b) => b.roas - a.roas);

  $('findings').innerHTML = `
    <div class="finding"><strong>CTR is a weak proxy for ROAS</strong>Rank correlation between click through rate and ROAS across styles is ${rho.toFixed(2)}. <em>${ctrLeader.name}</em> has the highest CTR (${F.pct(ctrLeader.ctr, 2)}) but ranks #${ctrLeaderRoasRank} of ${rows.length} on ROAS, because those clicks convert at ${F.pct(ctrLeader.cvr, 2)}. Optimizing creative selection on CTR would push budget the wrong way.</div>
    <div class="finding"><strong>Spend is misallocated, not just low</strong>${below.length ? `${below.length} styles below the ${state.floor.toFixed(2)}x floor take ${(belowShare * 100).toFixed(0)}% of spend but return only ${(belowRevShare * 100).toFixed(0)}% of revenue.` : `No style is below the ${state.floor.toFixed(2)}x floor at this setting.`} The fix is reallocation first, new creative second.</div>
    <div class="finding"><strong>Fatigue hides inside averages</strong><em>${fastest.name}</em> loses ${F.pct(fastest.decay, 0)} of its ROAS by week four, roughly ${wk1.toFixed(2)}x in week one down to ${wk4.toFixed(2)}x. Its 30 day average understates how good it is fresh and how bad it is stale, which argues for a refresh cadence rather than retirement.</div>
    <div class="finding"><strong>Channel fit matters for the winner</strong>The top style, <em>${best.name}</em>, returns ${chRoas[0].roas.toFixed(2)}x on ${chRoas[0].ch} against ${chRoas[chRoas.length - 1].roas.toFixed(2)}x on ${chRoas[chRoas.length - 1].ch}. Scaling it evenly across channels would dilute the gain.</div>`;
}

function renderActions(rows, ranked, imp) {
  const cut = ranked.filter(r => r.below);
  const rework = rows.filter(r => r.action === 'Rework offer, keep hook');
  const retire = rows.filter(r => r.action === 'Retire style');
  const refresh = rows.filter(r => r.action === 'Refresh creative' || (r.below && r.decay >= 0.28));
  const recv = imp.receivers.map(r => r.name);
  $('actions').innerHTML = `
    <li><div><h3>${cut.length ? `Pull budget from ${cut.slice(0, 2).map(r => r.name).join(' and ')}` : 'No style is below floor'}</h3><p>${cut.length ? `These carry the most revenue at risk. Move ${state.realloc}% of below floor spend (${F.usd(imp.moved)} a month) into ${recv.join(' and ')}, weighted by channel fit.` : 'At this floor every style clears its bar. Tighten the floor to see where marginal budget should move.'}</p><div class="meta"><span class="tag flag">${F.usd(imp.moved)} moved</span><span class="tag info">Media buying</span></div></div></li>
    <li><div><h3>${rework.length ? `Keep the hook, rework the offer on ${rework.map(r => r.name).join(', ')}` : retire.length ? `Retire ${retire.map(r => r.name).join(', ')}` : 'Test new generation styles'}</h3><p>${rework.length ? 'These win attention (CTR above average) but lose at conversion. Pair the same generation style with a stronger landing page or offer before cutting it entirely.' : retire.length ? 'Low CTR and low ROAS. Neither the hook nor the conversion path is working.' : 'With nothing to retire, use the test budget to find the next Scale style.'}</p><div class="meta"><span class="tag alt">Creative</span></div></div></li>
    <li><div><h3>Refresh on a cadence, not on a hunch</h3><p>${refresh.length ? `${refresh.map(r => r.name).join(', ')} decay 28% or more by week four. Trigger a new variant when a creative's rolling 7 day ROAS drops a set share below its first week.` : 'No style decays fast enough to need a forced refresh at this setting.'}</p><div class="meta"><span class="tag alt">${refresh.length} styles</span><span class="tag info">Automation</span></div></div></li>
    <li><div><h3>Feed style level ROAS into ad ranking</h3><p>Use conversion weighted cohort ROAS, not CTR, as the prior when ranking which generation style to recommend to an advertiser, with a decay feature so fatigued creatives lose rank before they lose money.</p><div class="meta"><span class="tag good">Ads ML</span></div></div></li>`;
}

function renderImpact(rows, imp) {
  $('reallocVal').textContent = state.realloc + '%';
  $('effVal').textContent = state.eff + '%';
  $('testVal').textContent = state.test + '%';
  $('reallocList').textContent = 'Budget goes to: ' + imp.receivers.map(r => r.name).join(', ');
  $('impactOut').innerHTML = `
    <div class="big hero"><div class="label">Projected blended ROAS</div><div class="num">${imp.newRoas.toFixed(2)}x</div><div class="desc">From ${imp.baseRoas.toFixed(2)}x today, ${imp.delta >= 0 ? '+' : ''}${F.usd(imp.delta)} revenue a month on the same total spend</div></div>
    <div class="big"><div class="label">Budget reallocated</div><div class="num">${F.usd(imp.moved)}</div><div class="desc">${F.usd(imp.toScale)} to scale styles, ${F.usd(imp.testBudget)} to tests</div></div>
    <div class="big"><div class="label">Annualized lift</div><div class="num">${F.usd(imp.delta * 12)}</div><div class="desc">Revenue, before creative production cost</div></div>`;
  const pts = [];
  for (let p = 0; p <= 100; p += 10) pts.push({ x: p, y: blendedAt(rows, p).newRoas });
  const nearest = Math.round(state.realloc / 10) * 10;
  Viz.line($('curve'), {
    points: pts, current: nearest, zero: false, xLabel: 'Share of below floor spend moved', xFmt: v => v + '%', yFmt: v => v.toFixed(2) + 'x',
    tipFor: p => { const b = blendedAt(rows, p.x); return Viz.tipHtml(p.x + '% moved', [['Blended ROAS', b.newRoas.toFixed(2) + 'x'], ['Revenue change', (b.delta >= 0 ? '+' : '') + F.usd(b.delta)], ['Budget moved', F.usd(b.moved)]]); },
  });
  let bestP = 0, bestR = -Infinity;
  for (let p = 0; p <= 100; p += 5) { const r = blendedAt(rows, p).newRoas; if (r > bestR + 1e-9) { bestR = r; bestP = p; } }
  $('assume').textContent = `Returns flatten as scale styles saturate: the first extra dollar earns ${state.eff}% of a style's average ROAS and each later dollar earns less. Under these assumptions blended ROAS peaks near ${bestP}% moved (${bestR.toFixed(2)}x)${bestP < 100 ? ', past which moving more budget costs more than it gains' : ''}. Move budget in steps with a holdout rather than all at once. Test spend is assumed to earn 80% of the blended average while new styles are learning.`;
}

function renderToggles() {
  Viz.toggle($('channelToggle'), ['All channels', ...CHANNELS], state.channel, v => { state.channel = v; renderToggles(); render(); });
  Viz.toggle($('metricToggle'), METRICS, state.metric, v => { state.metric = v; renderToggles(); render(); });
}
$('floor').addEventListener('input', e => { state.floor = +e.target.value; $('floorVal').textContent = state.floor.toFixed(2) + 'x'; render(); });
$('realloc').addEventListener('input', e => { state.realloc = +e.target.value; render(); });
$('eff').addEventListener('input', e => { state.eff = +e.target.value; render(); });
$('test').addEventListener('input', e => { state.test = +e.target.value; render(); });
Viz.sortable($('rankTable'), state.sort, render);

renderToggles();
render();
