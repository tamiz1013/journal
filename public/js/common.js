// Shared helpers: sidebar nav, auth, formatting, toast

function renderNav(active) {
  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    trades: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 4H2l8 9v6l4 2v-8l8-9z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  };
  document.getElementById('sidebar').innerHTML = `
    <div class="brand">Trade<span>Journal</span></div>
    <a class="nav-link ${active === 'dashboard' ? 'active' : ''}" href="/">${icons.dashboard} Dashboard</a>
    <a class="nav-link ${active === 'add' ? 'active' : ''}" href="/add.html">${icons.add} Add Trade</a>
    <a class="nav-link ${active === 'trades' ? 'active' : ''}" href="/trades.html">${icons.trades} Trades</a>
    <a class="nav-link ${active === 'filter' ? 'active' : ''}" href="/filter.html">${icons.filter} Filter</a>
    <div class="nav-footer">
      <div class="nav-user" id="nav-user"></div>
      <button class="nav-link nav-logout" id="logout-btn" type="button">${icons.logout} Log out</button>
    </div>
  `;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/login.html';
  });
}

// Redirect to login if there is no session; otherwise show the username in the sidebar
async function ensureAuth() {
  const res = await fetch('/api/auth/me');
  if (res.status === 401) {
    location.href = '/login.html';
    return new Promise(() => {}); // halt the caller while the browser navigates
  }
  const me = await res.json();
  const el = document.getElementById('nav-user');
  if (el) el.textContent = me.username;
  return me;
}

// Shared submit handler for login.html / signup.html
function authForm(endpoint, busyText) {
  const form = document.getElementById('auth-form');
  const btn = document.getElementById('submit-btn');
  const idle = btn.textContent;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = busyText;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.value,
          password: form.password.value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      location.href = '/';
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = idle;
    }
  });
}

function fmtMoney(v) {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function toast(msg, isError = false) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

async function fetchTrades() {
  const res = await fetch('/api/trades');
  if (res.status === 401) {
    location.href = '/login.html';
    return new Promise(() => {});
  }
  if (!res.ok) throw new Error('Failed to load trades');
  return res.json();
}

// Chart.js dark-theme defaults (set only on pages that load Chart.js)
function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#898781';
  Chart.defaults.borderColor = '#2c2c2a';
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#222221';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.10)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = '#c3c2b7';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
}
