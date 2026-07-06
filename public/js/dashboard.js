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
  // Open trades (no PnL written yet) don't count until completed
  allTrades = allTrades.filter((t) => t.pnl);
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
  renderAnalytics();
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

// ---------- Analytics: strategy / asset / mindset / insights ----------
function groupNet(trades, keyFn) {
  const m = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    m.set(k, (m.get(k) || 0) + t.net);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function netBarChart(canvasId, entries, horizontal) {
  new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        label: 'Net P&L',
        data: entries.map(([, v]) => v),
        backgroundColor: entries.map(([, v]) => (v >= 0 ? GOOD : BAD)),
        borderRadius: 4,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      maintainAspectRatio: false,
      scales: {
        [horizontal ? 'x' : 'y']: {
          grid: { color: TRACK },
          border: { display: false },
          ticks: { callback: (v) => fmtMoney(v) },
        },
        [horizontal ? 'y' : 'x']: { grid: { display: false } },
      },
      plugins: {
        tooltip: { callbacks: { label: (c) => ` ${fmtMoney(horizontal ? c.parsed.x : c.parsed.y)}` } },
      },
    },
  });
}

// Win % at each 0/3/5/7/9 self-rating, for psychology and confidence
function winPctByRating(trades, field) {
  return [0, 3, 5, 7, 9].map((r) => {
    const decided = trades.filter((t) => t[field] === r && t.outcome !== 'BE');
    if (!decided.length) return null;
    return (decided.filter((t) => t.outcome === 'WIN').length / decided.length) * 100;
  });
}

// Per-weekday performance (Monday → Sunday)
function dayOfWeekStats() {
  const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return order.map((day) => {
    const dayTrades = allTrades.filter((t) => dayName(t.date) === day);
    const wins = dayTrades.filter((t) => t.outcome === 'WIN').length;
    const losses = dayTrades.filter((t) => t.outcome === 'LOSS').length;
    return {
      day,
      count: dayTrades.length,
      net: dayTrades.reduce((s, t) => s + t.net, 0),
      wins,
      losses,
      winPct: wins + losses ? (wins / (wins + losses)) * 100 : null,
    };
  });
}

function renderDayOfWeek() {
  const stats = dayOfWeekStats();
  document.getElementById('dow-row').hidden = false;

  netBarChart('dow-pnl-chart', stats.map((s) => [s.day.slice(0, 3), s.net]), false);

  new Chart(document.getElementById('dow-win-chart'), {
    type: 'bar',
    data: {
      labels: stats.map((s) => s.day.slice(0, 3)),
      datasets: [{
        label: 'Win rate',
        data: stats.map((s) => s.winPct),
        backgroundColor: ACCENT,
        borderRadius: 4,
        maxBarThickness: 26,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: TRACK },
          border: { display: false },
          ticks: { callback: (v) => v + '%' },
        },
        x: { grid: { display: false } },
      },
      plugins: {
        tooltip: { callbacks: { label: (c) => {
          const s = stats[c.dataIndex];
          return s.winPct === null ? ' no closed trades'
            : ` ${s.winPct.toFixed(0)}% · ${s.wins}W · ${s.losses}L · ${s.count} trade${s.count > 1 ? 's' : ''}`;
        } } },
      },
    },
  });
}

function renderAnalytics() {
  if (!allTrades.length) return;
  document.getElementById('analytics-row').hidden = false;
  document.getElementById('analytics-row2').hidden = false;

  netBarChart('strategy-chart', groupNet(allTrades, (t) => t.strategy), true);
  netBarChart('asset-chart', groupNet(allTrades, (t) => t.asset), false);
  renderDayOfWeek();

  new Chart(document.getElementById('mindset-chart'), {
    type: 'bar',
    data: {
      labels: ['0', '3', '5', '7', '9'],
      datasets: [
        {
          label: 'Psychology',
          data: winPctByRating(allTrades, 'psychology'),
          backgroundColor: ACCENT,
          borderRadius: 4,
          maxBarThickness: 20,
        },
        {
          label: 'Confidence',
          data: winPctByRating(allTrades, 'confidence'),
          backgroundColor: '#199e70',
          borderRadius: 4,
          maxBarThickness: 20,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: TRACK },
          border: { display: false },
          ticks: { callback: (v) => v + '%' },
        },
        x: { grid: { display: false }, title: { display: true, text: 'Your rating at entry' } },
      },
      plugins: {
        legend: { display: true, position: 'top', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y === null ? 'no trades' : c.parsed.y.toFixed(0) + '%'}` } },
      },
    },
  });

  renderInsights();
}

function renderInsights() {
  const byStrategy = groupNet(allTrades, (t) => t.strategy);
  const byAsset = groupNet(allTrades, (t) => t.asset);
  const best = byStrategy[0];
  const worst = byStrategy[byStrategy.length - 1];

  // Streaks over trades ordered oldest → newest (BE trades don't break a streak)
  const ordered = [...allTrades].reverse();
  let cur = 0, longestWin = 0, longestLoss = 0, run = 0, runType = null;
  for (const t of ordered) {
    if (t.outcome === 'BE') continue;
    if (t.outcome === runType) run++;
    else { runType = t.outcome; run = 1; }
    if (runType === 'WIN') longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
    cur = (runType === 'WIN' ? 1 : -1) * run;
  }

  const avg = (arr, f) => (arr.length ? arr.reduce((s, t) => s + t[f], 0) / arr.length : null);
  const wins = allTrades.filter((t) => t.outcome === 'WIN');
  const losses = allTrades.filter((t) => t.outcome === 'LOSS');
  const psyWin = avg(wins, 'psychology');
  const psyLoss = avg(losses, 'psychology');
  const buys = allTrades.filter((t) => t.direction === 'BUY' && t.outcome !== 'BE');
  const sells = allTrades.filter((t) => t.direction === 'SELL' && t.outcome !== 'BE');
  const winRate = (arr) => (arr.length ? ((arr.filter((t) => t.outcome === 'WIN').length / arr.length) * 100).toFixed(0) + '%' : '—');

  const tradedDays = dayOfWeekStats().filter((s) => s.count);
  const bestDay = tradedDays.length
    ? tradedDays.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worstDay = tradedDays.length > 1
    ? tradedDays.reduce((a, b) => (b.net < a.net ? b : a)) : null;

  const rows = [
    ['Best strategy', best ? `${best[0]} (${fmtMoney(best[1])})` : '—', best && best[1] > 0 ? 'pos' : ''],
    ['Best day', bestDay ? `${bestDay.day} (${fmtMoney(bestDay.net)})` : '—', bestDay && bestDay.net > 0 ? 'pos' : ''],
    ['Worst day', worstDay ? `${worstDay.day} (${fmtMoney(worstDay.net)})` : '—', worstDay && worstDay.net < 0 ? 'neg' : ''],
    ['Worst strategy', worst && worst !== best ? `${worst[0]} (${fmtMoney(worst[1])})` : '—', worst && worst[1] < 0 ? 'neg' : ''],
    ['Most profitable asset', byAsset[0] ? `${byAsset[0][0]} (${fmtMoney(byAsset[0][1])})` : '—', byAsset[0] && byAsset[0][1] > 0 ? 'pos' : ''],
    ['Current streak', cur === 0 ? '—' : `${Math.abs(cur)} ${cur > 0 ? 'win' : 'loss'}${Math.abs(cur) > 1 ? 's' : ''}`, cur > 0 ? 'pos' : cur < 0 ? 'neg' : ''],
    ['Longest win / loss streak', `${longestWin} / ${longestLoss}`, ''],
    ['BUY vs SELL win rate', `${winRate(buys)} vs ${winRate(sells)}`, ''],
    ['Avg psychology on wins vs losses',
      psyWin === null || psyLoss === null ? '—' : `${psyWin.toFixed(1)} vs ${psyLoss.toFixed(1)}`, ''],
  ];

  document.getElementById('insights').innerHTML = rows.map(([k, v, cls]) =>
    `<li><span class="k">${k}</span><span class="v ${cls}">${escapeHtml(String(v))}</span></li>`).join('');
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
