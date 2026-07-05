renderNav('filter');

let allTrades = [];

const controls = {
  from: document.getElementById('f-from'),
  to: document.getElementById('f-to'),
  asset: document.getElementById('f-asset'),
  direction: document.getElementById('f-direction'),
  type: document.getElementById('f-type'),
  strategy: document.getElementById('f-strategy'),
  psychology: document.getElementById('f-psychology'),
  confidence: document.getElementById('f-confidence'),
  pnlOp: document.getElementById('f-pnl-op'),
  pnlVal: document.getElementById('f-pnl-val'),
};

init();

async function init() {
  await ensureAuth();
  try {
    allTrades = await fetchTrades();
  } catch (err) {
    toast(err.message, true);
    return;
  }
  for (const t of allTrades) {
    t.net = t.pnl - (t.fee || 0);
    t.outcome = t.net > 0 ? 'WIN' : t.net < 0 ? 'LOSS' : 'BE';
  }

  fillOptions(controls.asset, unique(allTrades.map((t) => t.asset)));
  fillOptions(controls.strategy, unique(allTrades.map((t) => t.strategy)));

  for (const el of Object.values(controls)) {
    el.addEventListener('input', apply);
  }
  controls.pnlOp.addEventListener('input', () => {
    controls.pnlVal.disabled = !controls.pnlOp.value;
    if (!controls.pnlOp.value) controls.pnlVal.value = '';
  });
  document.getElementById('reset-btn').addEventListener('click', reset);

  apply();
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function fillOptions(select, values) {
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
}

function reset() {
  for (const el of Object.values(controls)) el.value = '';
  controls.pnlVal.disabled = true;
  apply();
}

function currentFilters() {
  return {
    from: controls.from.value,
    to: controls.to.value,
    asset: controls.asset.value,
    direction: controls.direction.value,
    type: controls.type.value,
    strategy: controls.strategy.value,
    psychology: controls.psychology.value,
    confidence: controls.confidence.value,
    pnlOp: controls.pnlOp.value,
    pnlVal: controls.pnlVal.value,
  };
}

function matches(t, f) {
  if (f.from && t.date < f.from) return false;
  if (f.to && t.date > f.to) return false;
  if (f.asset && t.asset !== f.asset) return false;
  if (f.direction && t.direction !== f.direction) return false;
  if (f.type && t.type !== f.type) return false;
  if (f.strategy && t.strategy !== f.strategy) return false;
  if (f.psychology !== '' && t.psychology !== Number(f.psychology)) return false;
  if (f.confidence !== '' && t.confidence !== Number(f.confidence)) return false;
  if (f.pnlOp && f.pnlVal !== '') {
    const v = Number(f.pnlVal);
    if (f.pnlOp === 'gt' && !(t.net > v)) return false;
    if (f.pnlOp === 'lt' && !(t.net < v)) return false;
  }
  return true;
}

function apply() {
  const filtered = allTrades.filter((t) => matches(t, currentFilters()));
  document.getElementById('count-label').textContent =
    `${filtered.length} of ${allTrades.length} trades`;
  renderStats(filtered);
  renderTable(filtered);
}

// ---------- Statistics ----------
function computeStats(trades) {
  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const be = trades.length - wins.length - losses.length;
  const buys = trades.filter((t) => t.direction === 'BUY').length;
  const netPnl = trades.reduce((s, t) => s + t.net, 0);
  const totalFees = trades.reduce((s, t) => s + (t.fee || 0), 0);
  const grossWin = wins.reduce((s, t) => s + t.net, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net, 0));
  const decided = wins.length + losses.length;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const nets = trades.map((t) => t.net);

  return {
    count: trades.length,
    buys,
    sells: trades.length - buys,
    wins: wins.length,
    losses: losses.length,
    be,
    netPnl,
    totalFees,
    winPct: decided ? (wins.length / decided) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    avgWin,
    avgLoss,
    avgWL: avgLoss > 0 ? (avgWin ? avgWin / avgLoss : 0) : (avgWin ? null : 0),
    avgNet: trades.length ? netPnl / trades.length : 0,
    avgRR: trades.length ? trades.reduce((s, t) => s + t.rr, 0) / trades.length : 0,
    best: nets.length ? Math.max(...nets) : 0,
    worst: nets.length ? Math.min(...nets) : 0,
  };
}

function tile(title, value, sub = '', cls = '') {
  return `
    <div class="card tile">
      <div>
        <div class="card-title">${title}</div>
        <div class="value ${cls}">${value}</div>
        <div class="sub">${sub}</div>
      </div>
    </div>`;
}

function renderStats(trades) {
  const s = computeStats(trades);
  const posNeg = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

  document.getElementById('stat-tiles').innerHTML = [
    tile('Trades', s.count, `${s.buys} buy · ${s.sells} sell`),
    tile('Net P&L', s.count ? fmtMoney(s.netPnl) : '--',
      s.totalFees ? `after ${fmtMoney(s.totalFees)} fees` : '', posNeg(s.netPnl)),
    tile('Win rate', s.winPct === null ? '--' : s.winPct.toFixed(1) + '%',
      s.count ? `${s.wins}W · ${s.losses}L · ${s.be}BE` : ''),
    tile('Profit factor', s.profitFactor === null ? '--'
      : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)),
    tile('Avg win / loss', !s.count ? '--' : s.avgWL === null ? '∞' : s.avgWL.toFixed(2),
      s.count ? `${fmtMoney(s.avgWin)} vs -${fmtMoney(s.avgLoss)}` : ''),
    tile('Avg net per trade', s.count ? fmtMoney(s.avgNet) : '--', '', posNeg(s.avgNet)),
    tile('Avg RR', s.count ? s.avgRR.toFixed(2) + 'R' : '--'),
    tile('Best / worst trade', s.count ? `${fmtMoney(s.best)} / ${fmtMoney(s.worst)}` : '--'),
  ].join('');
}

// ---------- Table ----------
function renderTable(trades) {
  document.getElementById('empty-state').hidden = trades.length > 0;
  document.getElementById('filtered-body').innerHTML = trades.map((t) => `
    <tr>
      <td>${t.date}</td>
      <td>${t.time || '—'}</td>
      <td><strong style="color:var(--ink)">${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge ${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td>${t.type}</td>
      <td>${escapeHtml(t.strategy)}</td>
      <td>${t.psychology}</td>
      <td>${t.confidence}</td>
      <td>${t.rr}R</td>
      <td>${fmtMoney(t.pnl)}</td>
      <td>${t.fee ? fmtMoney(t.fee) : '—'}</td>
      <td><span class="badge ${t.outcome.toLowerCase()}">${t.outcome}</span></td>
      <td class="${t.net >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtMoney(t.net)}</td>
    </tr>`).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
