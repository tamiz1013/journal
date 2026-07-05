renderNav('dashboard');
applyChartDefaults();

const GOOD = '#0ca30c';
const BAD = '#d03b3b';
const ACCENT = '#3987e5';
const TRACK = '#2c2c2a';

let allTrades = [];
let calYear, calMonth; // calendar cursor

init();

async function init() {
  await ensureAuth();
  try {
    allTrades = await fetchTrades();
  } catch (err) {
    toast(err.message, true);
    return;
  }
  // Net result per trade: fee always comes out of the P&L; win/loss derived from net
  for (const t of allTrades) {
    t.net = t.pnl - (t.fee || 0);
    t.outcome = t.net > 0 ? 'WIN' : t.net < 0 ? 'LOSS' : 'BE';
  }
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  const stats = computeStats(allTrades);
  renderTiles(stats);
  renderScore(stats);
  renderEquityChart(stats);
  renderDailyChart(stats);
  renderCalendar();
  renderRecent();

  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));

  if (allTrades.length) {
    const dates = allTrades.map((t) => t.date).sort();
    document.getElementById('range-label').textContent =
      `${dates[0]} → ${dates[dates.length - 1]} · all trades`;
  }
}

// ---------- Stats ----------
function computeStats(trades) {
  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const netPnl = trades.reduce((s, t) => s + t.net, 0);
  const totalFees = trades.reduce((s, t) => s + (t.fee || 0), 0);
  const grossWin = wins.reduce((s, t) => s + t.net, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net, 0));
  const decided = wins.length + losses.length;

  // Group by day (sorted ascending)
  const byDay = new Map();
  for (const t of trades) {
    byDay.set(t.date, (byDay.get(t.date) || 0) + t.net);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const winDays = days.filter(([, p]) => p > 0).length;
  const lossDays = days.filter(([, p]) => p < 0).length;

  let cum = 0;
  const equity = days.map(([d, p]) => ({ date: d, value: (cum += p) }));

  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const discipline = trades.length
    ? trades.reduce((s, t) => s + t.psychology + t.confidence, 0) / (trades.length * 18)
    : 0;

  return {
    count: trades.length,
    netPnl,
    totalFees,
    winPct: decided ? (wins.length / decided) * 100 : null,
    wins: wins.length,
    losses: losses.length,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
    dayWinPct: winDays + lossDays ? (winDays / (winDays + lossDays)) * 100 : null,
    winDays,
    lossDays,
    avgWin,
    avgLoss,
    avgWL: avgLoss > 0 ? avgWin / avgLoss : null,
    avgRR: trades.length ? trades.reduce((s, t) => s + t.rr, 0) / trades.length : 0,
    discipline,
    days,
    equity,
  };
}

// ---------- Stat tiles ----------
function renderTiles(s) {
  document.getElementById('trade-count').textContent = s.count;

  const pnlEl = document.getElementById('net-pnl');
  if (s.count) {
    pnlEl.textContent = fmtMoney(s.netPnl);
    pnlEl.className = 'value ' + (s.netPnl > 0 ? 'pos' : s.netPnl < 0 ? 'neg' : '');
    document.getElementById('pnl-sub').textContent =
      s.totalFees ? `after ${fmtMoney(s.totalFees)} fees` : '';
  }

  if (s.winPct !== null) {
    document.getElementById('win-pct').textContent = s.winPct.toFixed(1) + '%';
    document.getElementById('win-sub').textContent = `${s.wins}W · ${s.losses}L`;
    ringDonut('win-donut', s.winPct / 100);
  }

  if (s.profitFactor !== null) {
    document.getElementById('profit-factor').textContent =
      s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    ringDonut('pf-donut', s.profitFactor === Infinity ? 1 : Math.min(s.profitFactor / 3, 1));
  }

  if (s.dayWinPct !== null) {
    document.getElementById('day-win-pct').textContent = s.dayWinPct.toFixed(1) + '%';
    document.getElementById('day-win-sub').textContent = `${s.winDays} green · ${s.lossDays} red`;
    ringDonut('day-donut', s.dayWinPct / 100);
  }

  if (s.avgWin || s.avgLoss) {
    document.getElementById('avg-wl').textContent = s.avgWL === null ? '∞' : s.avgWL.toFixed(2);
    const total = s.avgWin + s.avgLoss || 1;
    const bar = document.getElementById('wl-bar');
    bar.hidden = false;
    bar.querySelector('.w').style.width = `${(s.avgWin / total) * 100}%`;
    bar.querySelector('.l').style.width = `${(s.avgLoss / total) * 100}%`;
    document.getElementById('wl-legend').hidden = false;
    document.getElementById('avg-win').textContent = fmtMoney(s.avgWin);
    document.getElementById('avg-loss').textContent = '-' + fmtMoney(s.avgLoss);
  }
}

// Small progress ring next to a tile value (green share vs red remainder)
function ringDonut(canvasId, fraction) {
  new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [fraction, 1 - fraction],
        backgroundColor: [GOOD, TRACK],
        borderWidth: 2,
        borderColor: '#1a1a19',
        borderRadius: 4,
      }],
    },
    options: {
      cutout: '72%',
      responsive: false,
      events: [],
      plugins: { tooltip: { enabled: false } },
    },
  });
}

// ---------- Journal score gauge ----------
function renderScore(s) {
  if (!s.count) return;
  const winPart = (s.winPct ?? 0) / 100 * 30;
  const pf = s.profitFactor === Infinity ? 3 : (s.profitFactor ?? 0);
  const pfPart = Math.min(pf / 3, 1) * 25;
  const wlPart = Math.min((s.avgWL === null ? 2 : s.avgWL) / 2, 1) * 20;
  const dayPart = (s.dayWinPct ?? 0) / 100 * 15;
  const discPart = s.discipline * 10;
  const score = Math.round(winPart + pfPart + wlPart + dayPart + discPart);

  document.getElementById('score-num').textContent = score;

  new Chart(document.getElementById('score-gauge'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: [ACCENT, TRACK],
        borderWidth: 0,
        borderRadius: 6,
      }],
    },
    options: {
      circumference: 180,
      rotation: 270,
      cutout: '78%',
      maintainAspectRatio: false,
      events: [],
      plugins: { tooltip: { enabled: false } },
    },
  });
}

// ---------- Equity curve ----------
function renderEquityChart(s) {
  if (!s.equity.length) return;
  const ctx = document.getElementById('equity-chart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(57, 135, 229, 0.25)');
  gradient.addColorStop(1, 'rgba(57, 135, 229, 0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: s.equity.map((p) => p.date),
      datasets: [{
        label: 'Cumulative P&L',
        data: s.equity.map((p) => p.value),
        borderColor: ACCENT,
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: ACCENT,
        pointHoverBorderColor: '#1a1a19',
        pointHoverBorderWidth: 2,
        tension: 0.25,
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: {
          grid: { color: TRACK },
          border: { display: false },
          ticks: { callback: (v) => fmtMoney(v) },
        },
      },
      plugins: {
        tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.parsed.y)}` } },
      },
    },
  });
}

// ---------- Daily P&L bars ----------
function renderDailyChart(s) {
  if (!s.days.length) return;
  new Chart(document.getElementById('daily-chart'), {
    type: 'bar',
    data: {
      labels: s.days.map(([d]) => d),
      datasets: [{
        label: 'Daily P&L',
        data: s.days.map(([, p]) => p),
        backgroundColor: s.days.map(([, p]) => (p >= 0 ? GOOD : BAD)),
        borderRadius: 4,
        maxBarThickness: 26,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: {
          grid: { color: TRACK },
          border: { display: false },
          ticks: { callback: (v) => fmtMoney(v) },
        },
      },
      plugins: {
        tooltip: { callbacks: { label: (c) => ` ${fmtMoney(c.parsed.y)}` } },
      },
    },
  });
}

// ---------- Calendar ----------
function shiftMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const title = document.getElementById('cal-title');
  const monthName = new Date(calYear, calMonth, 1).toLocaleString('en', { month: 'long' });
  title.textContent = `${monthName} ${calYear}`;

  const byDay = new Map();
  for (const t of allTrades) {
    const d = byDay.get(t.date) || { pnl: 0, n: 0 };
    d.pnl += t.net;
    d.n += 1;
    byDay.set(t.date, d);
  }

  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    .map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = byDay.get(key);
    if (d) {
      const cls = d.pnl > 0 ? 'win' : d.pnl < 0 ? 'loss' : '';
      html += `<div class="cal-cell ${cls}">${day}
        <span class="pnl">${fmtMoney(d.pnl)}</span>
        <span class="n">${d.n} trade${d.n > 1 ? 's' : ''}</span></div>`;
    } else {
      html += `<div class="cal-cell">${day}</div>`;
    }
  }
  grid.innerHTML = html;
}

// ---------- Recent trades table ----------
function renderRecent() {
  const body = document.getElementById('recent-body');
  const recent = allTrades.slice(0, 10);
  document.getElementById('empty-state').hidden = recent.length > 0;

  body.innerHTML = recent.map((t) => `
    <tr>
      <td>${t.date}</td>
      <td><strong style="color:var(--ink)">${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge ${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td>${escapeHtml(t.strategy)}</td>
      <td>${t.rr}R</td>
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
