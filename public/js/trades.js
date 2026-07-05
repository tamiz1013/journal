renderNav('trades');

const body = document.getElementById('trades-body');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

load();

async function load() {
  await ensureAuth();
  let trades;
  try {
    trades = await fetchTrades();
  } catch (err) {
    toast(err.message, true);
    return;
  }
  document.getElementById('count-label').textContent = `${trades.length} total`;
  document.getElementById('empty-state').hidden = trades.length > 0;

  for (const t of trades) {
    t.net = t.pnl - (t.fee || 0);
    t.outcome = t.net > 0 ? 'WIN' : t.net < 0 ? 'LOSS' : 'BE';
  }

  body.innerHTML = trades.map((t) => `
    <tr data-id="${t.id}">
      <td>${t.date}</td>
      <td>${t.time || '—'}</td>
      <td><strong style="color:var(--ink)">${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge ${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td>${t.type}</td>
      <td>${escapeHtml(t.strategy)}</td>
      <td>${t.psychology}</td>
      <td>${t.confidence}</td>
      <td>${t.tf_1d}</td>
      <td>${t.tf_1h}</td>
      <td>${t.tf_5m}</td>
      <td>${t.rr}R</td>
      <td>${fmtMoney(t.pnl)}</td>
      <td>${t.fee ? fmtMoney(t.fee) : '—'}</td>
      <td><span class="badge ${t.outcome.toLowerCase()}">${t.outcome}</span></td>
      <td class="${t.net >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtMoney(t.net)}</td>
      <td title="${escapeHtml(t.note || '')}" style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(t.note || '—')}</td>
      <td>${t.hasScreenshot
        ? `<img class="thumb" src="/api/trades/${t.id}/screenshot" alt="screenshot" data-full="/api/trades/${t.id}/screenshot">`
        : '—'}</td>
      <td><button class="icon-btn" data-del="${t.id}" title="Delete trade">✕</button></td>
    </tr>`).join('');
}

body.addEventListener('click', async (e) => {
  const thumb = e.target.closest('.thumb');
  if (thumb) {
    lightboxImg.src = thumb.dataset.full;
    lightbox.classList.add('open');
    return;
  }
  const delBtn = e.target.closest('[data-del]');
  if (delBtn) {
    if (!confirm('Delete this trade? This cannot be undone.')) return;
    const res = await fetch(`/api/trades/${delBtn.dataset.del}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Trade deleted');
      load();
    } else {
      toast('Failed to delete trade', true);
    }
  }
});

lightbox.addEventListener('click', () => lightbox.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') lightbox.classList.remove('open');
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
