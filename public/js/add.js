renderNav('add');

const MAX_SHOTS = 3;

const form = document.getElementById('trade-form');
const assetSel = document.getElementById('asset');
const assetOtherField = document.getElementById('asset-other-field');
const assetOtherInput = document.getElementById('assetOther');
const rrSel = document.getElementById('rr');
const rrOtherField = document.getElementById('rr-other-field');
const rrOtherInput = document.getElementById('rrOther');
const pasteZone = document.getElementById('paste-zone');
const placeholder = document.getElementById('paste-placeholder');
const shotsGrid = document.getElementById('shots-grid');
const fileInput = document.getElementById('file-input');
const submitBtn = document.getElementById('submit-btn');

// Edit mode: /add.html?edit=<trade id> loads the trade and saves via PUT
const editId = new URLSearchParams(location.search).get('edit');

let screenshots = []; // data URLs, max 3

function setNow() {
  document.getElementById('date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('time').value = new Date().toTimeString().slice(0, 5);
}

init();

async function init() {
  await ensureAuth();
  if (!editId) {
    setNow();
    return;
  }
  document.querySelector('.page-title').textContent = 'Edit Trade';
  submitBtn.textContent = 'Update Trade';
  try {
    const res = await fetch(`/api/trades/${editId}`);
    if (!res.ok) throw new Error('Trade not found');
    fillForm(await res.json());
  } catch (err) {
    toast(err.message, true);
  }
}

function fillForm(t) {
  form.date.value = t.date;
  form.time.value = t.time || '';
  const knownAsset = [...assetSel.options].some((o) => o.value === t.asset && o.value !== 'OTHER');
  assetSel.value = knownAsset ? t.asset : 'OTHER';
  if (!knownAsset) {
    assetOtherField.hidden = false;
    assetOtherInput.required = true;
    assetOtherInput.value = t.asset;
  }
  form.direction.value = t.direction;
  form.type.value = t.type;
  form.strategy.value = t.strategy;
  form.psychology.value = String(t.psychology);
  form.confidence.value = String(t.confidence);
  form.tf_1d.value = String(t.tf_1d);
  form.tf_1h.value = String(t.tf_1h);
  form.tf_5m.value = String(t.tf_5m);
  const knownRR = [...rrSel.options].some((o) => o.value === String(t.rr) && o.value !== 'OTHER');
  rrSel.value = knownRR ? String(t.rr) : 'OTHER';
  if (!knownRR) {
    rrOtherField.hidden = false;
    rrOtherInput.required = true;
    rrOtherInput.value = t.rr;
  }
  form.pnl.value = t.pnl === 0 ? '' : t.pnl;
  form.fee.value = t.fee || '';
  form.note.value = t.note || '';
  screenshots = t.screenshots || [];
  renderShots();
}

// --- Conditional fields ---
assetSel.addEventListener('change', () => {
  const other = assetSel.value === 'OTHER';
  assetOtherField.hidden = !other;
  assetOtherInput.required = other;
  if (other) assetOtherInput.focus();
});

rrSel.addEventListener('change', () => {
  const other = rrSel.value === 'OTHER';
  rrOtherField.hidden = !other;
  rrOtherInput.required = other;
  if (other) rrOtherInput.focus();
});

// --- Screenshots: paste / click / drag & drop, up to 3, each removable ---
function renderShots() {
  shotsGrid.hidden = screenshots.length === 0;
  placeholder.hidden = screenshots.length >= MAX_SHOTS;
  shotsGrid.innerHTML = screenshots.map((s, i) => `
    <div class="shot-item">
      <img src="${s}" alt="Screenshot ${i + 1}">
      <button type="button" class="shot-del" data-shot-del="${i}" title="Remove this image">✕</button>
    </div>`).join('');
}

function addScreenshot(dataUrl) {
  if (screenshots.length >= MAX_SHOTS) {
    toast(`Maximum ${MAX_SHOTS} images per trade`, true);
    return false;
  }
  screenshots.push(dataUrl);
  renderShots();
  return true;
}

function readImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (screenshots.length >= MAX_SHOTS) {
    toast(`Maximum ${MAX_SHOTS} images per trade`, true);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => addScreenshot(e.target.result);
  reader.readAsDataURL(file);
}

// Ctrl+V anywhere on the page attaches the clipboard image
document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      if (screenshots.length < MAX_SHOTS) {
        readImageFile(item.getAsFile());
        toast('Screenshot attached from clipboard');
      } else {
        toast(`Maximum ${MAX_SHOTS} images per trade`, true);
      }
      return;
    }
  }
});

pasteZone.addEventListener('click', (e) => {
  const del = e.target.closest('[data-shot-del]');
  if (del) {
    screenshots.splice(Number(del.dataset.shotDel), 1);
    renderShots();
    return;
  }
  if (e.target.closest('.shot-item')) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) readImageFile(f);
  fileInput.value = '';
});

pasteZone.addEventListener('dragover', (e) => { e.preventDefault(); pasteZone.classList.add('drag'); });
pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('drag'));
pasteZone.addEventListener('drop', (e) => {
  e.preventDefault();
  pasteZone.classList.remove('drag');
  for (const f of e.dataTransfer.files) readImageFile(f);
});

// --- Submit ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  const body = {
    date: form.date.value,
    time: form.time.value,
    asset: assetSel.value,
    assetOther: assetOtherInput.value,
    direction: form.direction.value,
    type: form.type.value,
    strategy: form.strategy.value,
    psychology: form.psychology.value,
    confidence: form.confidence.value,
    tf_1d: form.tf_1d.value,
    tf_1h: form.tf_1h.value,
    tf_5m: form.tf_5m.value,
    rr: rrSel.value === 'OTHER' ? rrOtherInput.value : rrSel.value,
    pnl: form.pnl.value,
    fee: form.fee.value,
    note: form.note.value,
    screenshots,
  };

  try {
    const res = await fetch(editId ? `/api/trades/${editId}` : '/api/trades', {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save trade');
    }
    if (editId) {
      toast('Trade updated ✓');
      location.href = '/trades.html';
      return;
    }
    toast('Trade saved ✓');
    form.reset();
    setNow();
    assetOtherField.hidden = true;
    rrOtherField.hidden = true;
    screenshots = [];
    renderShots();
  } catch (err) {
    toast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editId ? 'Update Trade' : 'Save Trade';
  }
});
