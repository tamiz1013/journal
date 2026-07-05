renderNav('add');
ensureAuth();

const form = document.getElementById('trade-form');
const assetSel = document.getElementById('asset');
const assetOtherField = document.getElementById('asset-other-field');
const assetOtherInput = document.getElementById('assetOther');
const rrSel = document.getElementById('rr');
const rrOtherField = document.getElementById('rr-other-field');
const rrOtherInput = document.getElementById('rrOther');
const pasteZone = document.getElementById('paste-zone');
const placeholder = document.getElementById('paste-placeholder');
const preview = document.getElementById('paste-preview');
const shotImg = document.getElementById('shot-img');
const fileInput = document.getElementById('file-input');
const submitBtn = document.getElementById('submit-btn');

document.getElementById('date').value = new Date().toISOString().slice(0, 10);

let screenshotData = null;

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

// --- Screenshot: paste / click / drag & drop ---
function setScreenshot(dataUrl) {
  screenshotData = dataUrl;
  shotImg.src = dataUrl;
  placeholder.hidden = true;
  preview.hidden = false;
}

function clearScreenshot() {
  screenshotData = null;
  shotImg.src = '';
  placeholder.hidden = false;
  preview.hidden = true;
  fileInput.value = '';
}

function readImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => setScreenshot(e.target.result);
  reader.readAsDataURL(file);
}

// Ctrl+V anywhere on the page attaches the clipboard image
document.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      readImageFile(item.getAsFile());
      toast('Screenshot attached from clipboard');
      return;
    }
  }
});

pasteZone.addEventListener('click', (e) => {
  if (e.target.id === 'remove-shot') return;
  fileInput.click();
});
fileInput.addEventListener('change', () => readImageFile(fileInput.files[0]));
document.getElementById('remove-shot').addEventListener('click', clearScreenshot);

pasteZone.addEventListener('dragover', (e) => { e.preventDefault(); pasteZone.classList.add('drag'); });
pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('drag'));
pasteZone.addEventListener('drop', (e) => {
  e.preventDefault();
  pasteZone.classList.remove('drag');
  readImageFile(e.dataTransfer.files[0]);
});

// --- Submit ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  const body = {
    date: form.date.value,
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
    screenshot: screenshotData,
  };

  try {
    const res = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save trade');
    }
    toast('Trade saved ✓');
    form.reset();
    document.getElementById('date').value = new Date().toISOString().slice(0, 10);
    assetOtherField.hidden = true;
    rrOtherField.hidden = true;
    clearScreenshot();
  } catch (err) {
    toast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Trade';
  }
});
