// ── REGLAGES ──
const CONGE_COLORS_HEX = { cp:'#6c63ff', rtt:'#3ecf8e' };

function renderReglages() {
  updateWorkModeSummary();
  renderCloudSyncSettings();
  const types = ['cp','rtt'];

  // Quota cards
  document.getElementById('quotaCards').innerHTML = `<div class="settings-card">${
    types.map(t => `
    <div class="settings-row">
      <div class="settings-dot" style="background:${CONGE_COLORS_HEX[t]}"></div>
      <label>${CONGE_LABELS[t]}</label>
      <input type="number" min="0" max="365" value="${state.quotas[t]}"
        onchange="updateQuota('${t}', this.value)">
    </div>`).join('')
  }</div>`;

  // Label cards
  document.getElementById('labelCards').innerHTML = `<div class="settings-card">${
    types.map(t => `
    <div class="settings-row">
      <div class="settings-dot" style="background:${CONGE_COLORS_HEX[t]}"></div>
      <input type="text" value="${escapeHtml(CONGE_LABELS[t])}"
        onchange="updateLabel('${t}', this.value)" style="flex:1;width:auto">
    </div>`).join('')
  }</div>`;

  const resumeJourEl = document.getElementById('resumeJourEnabled');
  if (resumeJourEl) resumeJourEl.checked = resumeJour.enabled;
  const cct = document.getElementById('customTypeCards');
  if (cct) {
    if (customCongeTypes.length === 0) {
      cct.innerHTML = '<p style="color:#8b8fa8;font-size:13px;text-align:center;padding:8px">Aucun type personnalisé</p>';
    } else {
      cct.innerHTML = '<div class="settings-card">' + customCongeTypes.map((t,i) => '<div class="settings-row"><div class="settings-dot" style="background:'+escapeHtml(t.color)+'"></div><span style="flex:1">'+escapeHtml(t.label)+'</span><button onclick="editCustomType('+i+')" style="background:var(--border);color:var(--text);border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;margin-right:6px">Modifier</button><button onclick="removeCustomType('+i+')" style="background:#ff6584;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Supprimer</button></div>').join('') + '</div>';
    }
  }
  refreshCongeSelect();
}

function updateQuota(type, val) {
  const n = parseInt(val);
  if (isNaN(n) || n < 0) return;
  state.quotas[type] = n;
  saveConges();
  showToast('Quota mis à jour ✓');
}

function updateLabel(type, val) {
  const v = val.trim();
  if (!v) return;
  CONGE_LABELS[type] = v;
  saveConges();
  showToast('Nom mis à jour ✓');
}

function refreshCongeSelect() {
  const sel = document.getElementById('congeType');
  if (!sel) return;
  const prev = sel.value;
  const emojis = {cp:'🟣',rtt:'🟢'};
  let opts = ['cp','rtt'].map(t => '<option value="'+t+'">'+(emojis[t]||'⚪')+' '+escapeHtml(CONGE_LABELS[t]||t.toUpperCase())+'</option>').join('');
  customCongeTypes.forEach(t => { opts += '<option value="'+t.id+'">🔵 '+escapeHtml(t.label)+'</option>'; });
  sel.innerHTML = opts;
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

const CUSTOM_TYPE_COLOR_PALETTE = ['#a78bfa','#34d399','#fbbf24','#f87171','#60a5fa','#f472b6','#4ade80','#fb923c','#6c63ff','#3ecf8e','#f59e0b','#ff6584'];

let customTypeModalEditIndex = null;
let customTypeModalSelectedColor = CUSTOM_TYPE_COLOR_PALETTE[0];

function openAddCustomType() {
  customTypeModalEditIndex = null;
  customTypeModalSelectedColor = CUSTOM_TYPE_COLOR_PALETTE[customCongeTypes.length % CUSTOM_TYPE_COLOR_PALETTE.length];
  const titleEl = document.getElementById('customTypeModalTitle');
  const nameEl = document.getElementById('customTypeNameInput');
  const errEl = document.getElementById('customTypeModalError');
  const saveBtn = document.querySelector('#customTypeModal .modal-btn-save');
  if (titleEl) titleEl.textContent = 'Nouveau type de congé';
  if (nameEl) nameEl.value = '';
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (saveBtn) saveBtn.textContent = 'Créer';
  renderCustomTypeColorSwatches();
  updateCustomTypePreview();
  const modal = document.getElementById('customTypeModal');
  if (modal) modal.style.display = 'flex';
  if (nameEl) setTimeout(() => nameEl.focus(), 50);
}

function editCustomType(index) {
  const t = customCongeTypes[index];
  if (!t) return;
  customTypeModalEditIndex = index;
  customTypeModalSelectedColor = t.color;
  const titleEl = document.getElementById('customTypeModalTitle');
  const nameEl = document.getElementById('customTypeNameInput');
  const errEl = document.getElementById('customTypeModalError');
  const saveBtn = document.querySelector('#customTypeModal .modal-btn-save');
  if (titleEl) titleEl.textContent = 'Modifier le type de congé';
  if (nameEl) nameEl.value = t.label;
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (saveBtn) saveBtn.textContent = 'Enregistrer';
  renderCustomTypeColorSwatches();
  updateCustomTypePreview();
  const modal = document.getElementById('customTypeModal');
  if (modal) modal.style.display = 'flex';
  if (nameEl) setTimeout(() => nameEl.focus(), 50);
}

function closeCustomTypeModal() {
  const modal = document.getElementById('customTypeModal');
  if (modal) modal.style.display = 'none';
  customTypeModalEditIndex = null;
}

function renderCustomTypeColorSwatches() {
  const container = document.getElementById('customTypeColorSwatches');
  if (!container) return;
  container.innerHTML = CUSTOM_TYPE_COLOR_PALETTE.map(c => `
    <div onclick="selectCustomTypeColor('${c}')" style="cursor:pointer;width:100%;aspect-ratio:1;border-radius:10px;background:${c};border:3px solid ${customTypeModalSelectedColor === c ? '#fff' : 'transparent'};box-shadow:${customTypeModalSelectedColor === c ? '0 0 0 2px ' + c : 'none'};display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff">${customTypeModalSelectedColor === c ? '✓' : ''}</div>
  `).join('');
}

function selectCustomTypeColor(color) {
  customTypeModalSelectedColor = color;
  renderCustomTypeColorSwatches();
  updateCustomTypePreview();
}

function updateCustomTypePreview() {
  const nameEl = document.getElementById('customTypeNameInput');
  const dotEl = document.getElementById('customTypePreviewDot');
  const labelEl = document.getElementById('customTypePreviewLabel');
  if (dotEl) dotEl.style.background = customTypeModalSelectedColor;
  if (labelEl) labelEl.textContent = (nameEl && nameEl.value.trim()) ? nameEl.value.trim() : 'Nom du type';
}

function submitCustomTypeModal() {
  const nameEl = document.getElementById('customTypeNameInput');
  const errEl = document.getElementById('customTypeModalError');
  const label = nameEl ? nameEl.value.trim() : '';
  if (!label) {
    if (errEl) { errEl.textContent = 'Le nom est requis.'; errEl.style.display = 'block'; }
    return;
  }
  const duplicate = customCongeTypes.some((t, i) => t.label.toLowerCase() === label.toLowerCase() && i !== customTypeModalEditIndex);
  if (duplicate) {
    if (errEl) { errEl.textContent = 'Ce nom est déjà utilisé par un autre type.'; errEl.style.display = 'block'; }
    return;
  }
  if (customTypeModalEditIndex !== null) {
    const t = customCongeTypes[customTypeModalEditIndex];
    if (t) {
      t.label = label.slice(0, 40);
      t.color = customTypeModalSelectedColor;
    }
    showToast('Type modifié ✓');
  } else {
    const id = 'custom_' + Date.now() + '_' + Math.floor(Math.random()*100000);
    customCongeTypes.push({id, label: label.slice(0, 40), color: customTypeModalSelectedColor});
    showToast('Type ajouté ✓');
  }
  saveConges();
  closeCustomTypeModal();
  renderReglages();
}

function removeCustomType(index) {
  const t = customCongeTypes[index];
  if (!t) return;
  const usedCount = state.conges.filter(c => c.type === t.id).length;
  const warning = usedCount > 0
    ? `Ce type est utilisé par ${usedCount} congé${usedCount > 1 ? 's' : ''} déjà posé${usedCount > 1 ? 's' : ''}, qui resteront mais afficheront un nom générique. `
    : '';
  if (!confirm(warning + 'Supprimer le type "' + t.label + '" ?')) return;
  customCongeTypes.splice(index, 1);
  saveConges();
  renderReglages();
  showToast('Type supprimé');
}



  function openObjectifsSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-objectifs-settings').classList.add('active');
    renderObjectifsParJour();
  }

const JOURS_LABELS = { 1:'Lundi', 2:'Mardi', 3:'Mercredi', 4:'Jeudi', 5:'Vendredi', 6:'Samedi', 0:'Dimanche' };
function renderObjectifsParJour() {
  const card = document.getElementById('objectifsParJourCard');
  if (!card) return;
  const order = [1,2,3,4,5,6,0];
  card.innerHTML = order.map(d => {
    const val = ((objectifs.parJour && typeof objectifs.parJour[d] !== 'undefined') ? objectifs.parJour[d] : objectifs.jour) / 3600000;
    return `<div class="settings-row">
      <div class="settings-dot" style="background:var(--accent)"></div>
      <label>${JOURS_LABELS[d]}</label>
      <input type="number" min="0" max="24" step="0.5" value="${val}"
        style="width:70px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;font-weight:700;padding:6px 10px;outline:none;"
        onchange="updateObjectifJourSemaine(${d}, this.value)">
      <span style="font-size:13px;color:var(--muted);margin-left:4px">h</span>
    </div>`;
  }).join('');
  const semEl = document.getElementById('objectifSemAuto');
  if (semEl) semEl.textContent = fmtHM(getWeekGoalBase());
}
function updateObjectifJourSemaine(dow, val) {
  const h = parseFloat(val);
  if (isNaN(h) || h < 0) return;
  if (!objectifs.parJour) objectifs.parJour = {};
  objectifs.parJour[dow] = h * 3600000;
  saveObjectifs();
  renderObjectifs();
  renderObjectifsParJour();
  showToast('Objectif mis à jour ✓');
}

function updateObjectif(type, val) {
  const h = parseFloat(val);
  if (isNaN(h) || h < 0) return;
  objectifs[type] = h * 3600000;
  saveObjectifs();
  renderObjectifs();
  showToast('Objectif mis à jour ✓');
}

  function openExportListSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-export-list-settings').classList.add('active');
  renderExportIncludeCongesToggle();
}

function openExportSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-export-settings').classList.add('active');
}

function openClearSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-clear-settings').classList.add('active');
}


const THEME_PALETTES = [
  { id: 'violet', name: 'Base', accent: '#6c63ff', accent2: '#ff6584' },
  { id: 'bleu', name: 'Bleu océan', accent: '#3b82f6', accent2: '#06b6d4' },
  { id: 'vert', name: 'Vert forêt', accent: '#22c55e', accent2: '#84cc16' },
  { id: 'rose', name: 'Rose corail', accent: '#ec4899', accent2: '#f97316' },
  { id: 'orange', name: 'Orange soleil', accent: '#f97316', accent2: '#eab308' },
  { id: 'rouge', name: 'Rouge rubis', accent: '#ef4444', accent2: '#f43f5e' },
  { id: 'turquoise', name: 'Turquoise', accent: '#14b8a6', accent2: '#06b6d4' },
  { id: 'indigo', name: 'Indigo nuit', accent: '#6366f1', accent2: '#8b5cf6' }
];

// ══════════════════════════════════════════════════════════
// PRÉVISION DE FIN D'OBJECTIF MENSUEL
// Estime, à partir du rythme moyen de travail depuis le début du mois,
// la date à laquelle l'objectif mensuel (jour × jours ouvrés) sera atteint.
// ══════════════════════════════════════════════════════════

function getMonthGoalMs(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let goal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    goal += (objectifs.parJour && typeof objectifs.parJour[dow] !== 'undefined') ? objectifs.parJour[dow] : objectifs.jour;
  }
  return goal;
}

function getMonthProgressForecast() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const todayNum = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const doneMs = state.sessions
    .filter(s => s.start >= monthStart && s.start < monthEnd)
    .reduce((a, s) => a + (s.net || 0), 0);

  let liveMs = 0;
  if (state.status !== 'idle' && state.startTs) {
    const n = Date.now();
    let pause = state.totalPauseMs;
    if (state.status === 'paused' && state.pauseStart) pause += n - state.pauseStart;
    liveMs = Math.max(0, n - state.startTs - pause);
  }
  const totalDoneMs = doneMs + liveMs;
  const goalMs = getMonthGoalMs(year, month);

  if (todayNum < 1 || totalDoneMs <= 0 || goalMs <= 0) {
    return { status: 'no-data', doneMs: totalDoneMs, goalMs, pct: 0 };
  }

  const avgPerDay = totalDoneMs / todayNum;
  const remainingMs = goalMs - totalDoneMs;
  const pct = Math.min(100, (totalDoneMs / goalMs) * 100);

  if (remainingMs <= 0) {
    return { status: 'done', doneMs: totalDoneMs, goalMs, pct: 100 };
  }

  if (avgPerDay <= 0) {
    return { status: 'stalled', doneMs: totalDoneMs, goalMs, pct };
  }

  const daysNeeded = Math.ceil(remainingMs / avgPerDay);
  const forecastDay = todayNum + daysNeeded;

  if (forecastDay > daysInMonth) {
    const overrunDays = forecastDay - daysInMonth;
    return { status: 'behind', doneMs: totalDoneMs, goalMs, pct, overrunDays, avgPerDay };
  }

  const forecastDate = new Date(year, month, forecastDay);
  return { status: 'ontrack', doneMs: totalDoneMs, goalMs, pct, forecastDate, avgPerDay, daysNeeded };
}

function renderMonthForecastCard() {
  const el = document.getElementById('monthForecastCard');
  if (!el) return;
  const f = getMonthProgressForecast();

  if (f.status === 'no-data') {
    el.innerHTML = `<div class="objectif-card"><div style="font-size:12px;color:var(--muted);">Pas encore assez de données ce mois-ci pour estimer une prévision.</div></div>`;
    return;
  }

  const pctLabel = Math.round(f.pct) + '%';
  let bodyHtml = '';

  if (f.status === 'done') {
    bodyHtml = `<div style="font-size:13px;color:var(--green);font-weight:700;">🎉 Objectif mensuel déjà atteint !</div>`;
  } else if (f.status === 'stalled') {
    bodyHtml = `<div style="font-size:13px;color:var(--muted);">Pas de rythme régulier détecté pour l'instant.</div>`;
  } else if (f.status === 'behind') {
    bodyHtml = `<div style="font-size:13px;color:var(--accent2);font-weight:700;">⚠️ À ce rythme (${fmtHM(f.avgPerDay)}/jour), l'objectif serait atteint ${f.overrunDays} jour${f.overrunDays > 1 ? 's' : ''} après la fin du mois.</div>`;
  } else if (f.status === 'ontrack') {
    const dateStr = f.forecastDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    bodyHtml = `<div style="font-size:13px;color:var(--text);">À ce rythme (<strong style="color:var(--accent)">${fmtHM(f.avgPerDay)}/jour</strong>), tu atteindras ton objectif mensuel le <strong style="color:var(--green)">${dateStr}</strong>.</div>`;
  }

  el.innerHTML = `
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Prévision objectif mensuel</span>
        <span class="objectif-values" style="color:${f.pct>=100?'var(--green)':'var(--accent)'}">${fmtHM(f.doneMs)} / ${fmtHM(f.goalMs)} <span style="font-size:11px;color:var(--muted)">${pctLabel}</span></span>
      </div>
      <div class="objectif-bar-bg">
        <div class="objectif-bar-fill ${f.pct>=100?'done':'progress'}" style="width:${f.pct}%"></div>
      </div>
      <div style="margin-top:10px;">${bodyHtml}</div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════
// COURBE DE PROGRESSION PLURIANNUELLE
// Superpose, pour chaque année disponible, la courbe cumulative des heures
// travaillées jour après jour (jour de l'année 1 à 365), pour comparer
// visuellement le rythme d'une année à l'autre au même moment du calendrier.
// ══════════════════════════════════════════════════════════

function getMultiYearCumulativeData() {
  const years = [...new Set(state.sessions.map(s => new Date(s.start).getFullYear()))].sort();
  if (!years.length) return { years: [], series: {} };
  const series = {};
  years.forEach(y => {
    const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInYear = isLeap ? 366 : 365;
    const dayTotals = new Array(daysInYear + 1).fill(0);
    state.sessions.filter(s => new Date(s.start).getFullYear() === y).forEach(s => {
      const d = new Date(s.start);
      const start = new Date(y, 0, 1);
      const dayOfYear = Math.floor((d - start) / 86400000) + 1;
      if (dayOfYear >= 1 && dayOfYear <= daysInYear) dayTotals[dayOfYear] += (s.net || 0);
    });
    const cum = [];
    let running = 0;
    for (let i = 1; i <= daysInYear; i++) {
      running += dayTotals[i];
      cum.push(running / 3600000);
    }
    series[y] = cum;
  });
  return { years, series };
}

const MULTIYEAR_COLORS = ['#6c63ff', '#3ecf8e', '#f59e0b', '#ff6584', '#00b4d8', '#c77dff'];

function renderMultiYearChart() {
  const canvas = document.getElementById('multiYearChart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || canvas.parentElement.clientWidth;
  const cssH = 180;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const { years, series } = getMultiYearCumulativeData();
  if (!years.length) return;

  const padL = 38, padR = 8, padT = 10, padB = 20;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  let maxVal = 1;
  Object.values(series).forEach(arr => { const m = Math.max(...arr); if (m > maxVal) maxVal = m; });
  maxVal *= 1.1;

  const muted = getComputedStyle(document.body).getPropertyValue('--muted') || '#8b8fa8';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = muted;
  ctx.font = '9px -apple-system, sans-serif';
  for (let g = 0; g <= 3; g++) {
    const y = padT + plotH - (g / 3) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.fillText(Math.round(maxVal * g / 3) + 'h', 2, y + 3);
  }

  years.forEach((y, idx) => {
    const arr = series[y];
    const color = MULTIYEAR_COLORS[idx % MULTIYEAR_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    arr.forEach((v, i) => {
      const x = padL + (i / (arr.length - 1)) * plotW;
      const yy = padT + plotH - (v / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    });
    ctx.stroke();
  });

  const monthLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  for (let m = 0; m < 12; m += 2) {
    const x = padL + (m / 12) * plotW;
    ctx.fillText(monthLabels[m], x, cssH - 4);
  }
  ctx.textAlign = 'left';

  renderMultiYearLegend(years);
}

function renderMultiYearLegend(years) {
  const el = document.getElementById('multiYearLegend');
  if (!el) return;
  el.innerHTML = years.map((y, idx) => {
    const color = MULTIYEAR_COLORS[idx % MULTIYEAR_COLORS.length];
    return `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted);">
      <div style="width:12px;height:3px;border-radius:2px;background:${color}"></div>${y}
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
// HEATMAP ANNUELLE (calendrier de contributions façon GitHub)
// ══════════════════════════════════════════════════════════

let _heatmapYear = new Date().getFullYear();

function getHeatmapDayTotals(year) {
  const totals = {};
  state.sessions.forEach(s => {
    const d = new Date(s.start);
    if (d.getFullYear() !== year) return;
    const key = toLocalISO(d);
    totals[key] = (totals[key] || 0) + (s.net || 0);
  });
  return totals;
}

function heatmapColorForMs(ms, maxMs) {
  if (!ms) return 'rgba(139,143,168,.12)';
  const ratio = Math.min(1, ms / (maxMs || 1));
  if (ratio < 0.25) return 'rgba(62,207,142,.3)';
  if (ratio < 0.5) return 'rgba(62,207,142,.55)';
  if (ratio < 0.75) return 'rgba(62,207,142,.8)';
  return 'rgba(62,207,142,1)';
}

function renderHeatmap() {
  const el = document.getElementById('heatmapGrid');
  const labelEl = document.getElementById('heatmapYearLabel');
  if (!el) return;
  if (labelEl) labelEl.textContent = _heatmapYear;

  const totals = getHeatmapDayTotals(_heatmapYear);
  const maxMs = Math.max(1, ...Object.values(totals));

  const startDate = new Date(_heatmapYear, 0, 1);
  const endDate = new Date(_heatmapYear, 11, 31);
  const startDow = startDate.getDay();
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - startDow);

  const weeks = [];
  let cur = new Date(gridStart);
  while (cur <= endDate) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  let html = '<div style="display:flex;gap:3px;overflow-x:auto;padding-bottom:6px;">';
  weeks.forEach(week => {
    html += '<div style="display:flex;flex-direction:column;gap:3px;">';
    week.forEach(day => {
      if (day.getFullYear() !== _heatmapYear) {
        html += '<div style="width:11px;height:11px;"></div>';
      } else {
        const key = toLocalISO(day);
        const ms = totals[key] || 0;
        const color = heatmapColorForMs(ms, maxMs);
        const label = day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        html += `<div onclick="showHeatmapTooltip('${key}', ${ms})" title="${label}: ${ms ? fmtHM(ms) : 'Aucune session'}" style="width:11px;height:11px;border-radius:2px;background:${color};cursor:pointer;"></div>`;
      }
    });
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;

  const totalDaysWorked = Object.keys(totals).length;
  const totalMs = Object.values(totals).reduce((a, v) => a + v, 0);
  const summaryEl = document.getElementById('heatmapSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `${totalDaysWorked} jour${totalDaysWorked !== 1 ? 's' : ''} travaillé${totalDaysWorked !== 1 ? 's' : ''} · ${fmtHM(totalMs)} au total en ${_heatmapYear}`;
  }
}

function showHeatmapTooltip(dateKey, ms) {
  const d = new Date(dateKey + 'T00:00:00');
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  showToast(`${label} : ${ms ? fmtHM(ms) : 'aucune session'}`);
}

function changeHeatmapYear(delta) {
  const years = [...new Set(state.sessions.map(s => new Date(s.start).getFullYear()))];
  const minYear = years.length ? Math.min(...years) : new Date().getFullYear();
  const newYear = _heatmapYear + delta;
  if (newYear < minYear || newYear > new Date().getFullYear()) return;
  _heatmapYear = newYear;
  renderHeatmap();
}

// ══════════════════════════════════════════════════════════
// ANNIVERSAIRE DE TRAVAIL
// ══════════════════════════════════════════════════════════

function getWorkStartDate() {
  const custom = localStorage.getItem('orvia_work_start_date');
  if (custom) return custom;
  if (!state.sessions.length) return null;
  const earliest = state.sessions.reduce((min, s) => s.start < min ? s.start : min, state.sessions[0].start);
  return toLocalISO(new Date(earliest));
}

function setWorkStartDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  localStorage.setItem('orvia_work_start_date', dateStr);
  renderWorkAnniversarySettings();
  showToast('Date de début enregistrée ✓');
}

function getWorkAnniversaryEnabled() {
  return localStorage.getItem('orvia_work_anniv_enabled') !== 'false';
}

function setWorkAnniversaryEnabled(val) {
  localStorage.setItem('orvia_work_anniv_enabled', val ? 'true' : 'false');
}

function getYearsOfService() {
  const startStr = getWorkStartDate();
  if (!startStr) return null;
  const start = new Date(startStr + 'T00:00:00');
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const anniversaryThisYear = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  if (now < anniversaryThisYear) years -= 1;
  return { years, startDate: start };
}

function checkWorkAnniversary() {
  if (!getWorkAnniversaryEnabled()) return;
  const startStr = getWorkStartDate();
  if (!startStr) return;
  const start = new Date(startStr + 'T00:00:00');
  const now = new Date();
  const isAnniversaryToday = now.getMonth() === start.getMonth() && now.getDate() === start.getDate();
  const years = now.getFullYear() - start.getFullYear();
  if (!isAnniversaryToday || years < 1) return;

  const shownKey = 'orvia_anniv_shown_' + now.getFullYear();
  if (localStorage.getItem(shownKey)) return;
  localStorage.setItem(shownKey, '1');

  const msg = `🎉 Tu travailles ici depuis ${years} an${years > 1 ? 's' : ''} !`;
  showToast(msg);
  if (('Notification' in window) && Notification.permission === 'granted') {
    orviaNotify('Anniversaire de travail', { body: msg });
  }
}

function renderWorkAnniversarySettings() {
  const enabledEl = document.getElementById('workAnnivEnabled');
  const dateEl = document.getElementById('workStartDateInput');
  const summaryEl = document.getElementById('workAnnivSummary');
  if (enabledEl) enabledEl.checked = getWorkAnniversaryEnabled();
  const startStr = getWorkStartDate();
  if (dateEl && startStr) dateEl.value = startStr;
  if (summaryEl) {
    const yos = getYearsOfService();
    summaryEl.textContent = yos
      ? `Ancienneté actuelle : ${yos.years} an${yos.years !== 1 ? 's' : ''} (depuis le ${yos.startDate.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })})`
      : 'Aucune session enregistrée pour détecter automatiquement une date de début.';
  }
}

function onWorkAnnivEnabledToggle() {
  const el = document.getElementById('workAnnivEnabled');
  setWorkAnniversaryEnabled(el ? el.checked : true);
  showToast('Réglages mis à jour ✓');
}

function onWorkStartDateChange() {
  const el = document.getElementById('workStartDateInput');
  if (el && el.value) setWorkStartDate(el.value);
}

function openWorkAnniversarySettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-workanniv-settings').classList.add('active');
  renderWorkAnniversarySettings();
}

// ══════════════════════════════════════════════════════════
// MODE COMPACT
// ══════════════════════════════════════════════════════════

function getCompactModeEnabled() {
  return localStorage.getItem('orvia_compact_mode') === 'true';
}

function applyCompactMode(enabled) {
  document.documentElement.classList.toggle('compact-mode', enabled);
  localStorage.setItem('orvia_compact_mode', enabled ? 'true' : 'false');
}

function onCompactModeToggle() {
  const el = document.getElementById('compactModeEnabled');
  applyCompactMode(el ? el.checked : false);
  showToast('Réglages mis à jour ✓');
}

function initCompactMode() {
  applyCompactMode(getCompactModeEnabled());
  const el = document.getElementById('compactModeEnabled');
  if (el) el.checked = getCompactModeEnabled();
}

// ══════════════════════════════════════════════════════════
// SIMULATEUR DE CHARGE FISCALE PAR TRANCHES RÉELLES
// ══════════════════════════════════════════════════════════

const DEFAULT_TAX_BRACKETS_2026 = [
  { max: 11600, rate: 0 },
  { max: 29579, rate: 11 },
  { max: 84577, rate: 30 },
  { max: 181917, rate: 41 },
  { max: Infinity, rate: 45 }
];

function getTaxBrackets() {
  try {
    const raw = localStorage.getItem('orvia_tax_brackets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        // La borne Infinity ne survit pas à JSON.stringify (devenait null) :
        // on la restaure sur la dernière tranche pour éviter un plafond
        // artificiel du barème après une sauvegarde.
        return parsed.map((b, idx) => idx === parsed.length - 1 && (b.max === null || !Number.isFinite(b.max))
          ? { ...b, max: Infinity }
          : b);
      }
    }
  } catch (e) {}
  return DEFAULT_TAX_BRACKETS_2026;
}

function saveTaxBrackets(brackets) {
  // Remplace Infinity par un sentinel sérialisable (JSON.stringify(Infinity) === null,
  // ce qui casserait la tranche la plus haute du barème progressif).
  const safe = brackets.map(b => ({ ...b, max: Number.isFinite(b.max) ? b.max : null }));
  localStorage.setItem('orvia_tax_brackets', JSON.stringify(safe));
}

function getTaxParts() {
  const raw = localStorage.getItem('orvia_tax_parts');
  const n = raw ? parseFloat(raw) : 1;
  return clampNumber(n, 0.5, 10, 1);
}

function saveTaxParts(n) {
  localStorage.setItem('orvia_tax_parts', String(clampNumber(n, 0.5, 10, 1)));
}

function getTaxSimulatorEnabled() {
  return localStorage.getItem('orvia_tax_sim_enabled') === 'true';
}

function setTaxSimulatorEnabled(val) {
  localStorage.setItem('orvia_tax_sim_enabled', val ? 'true' : 'false');
}

function calcProgressiveTax(annualBrut, parts) {
  const brackets = getTaxBrackets();
  const quotient = annualBrut / (parts || 1);
  let tax = 0;
  let prevMax = 0;
  for (const b of brackets) {
    if (quotient <= prevMax) break;
    const trancheHaut = Math.min(quotient, b.max);
    const trancheMontant = Math.max(0, trancheHaut - prevMax);
    tax += trancheMontant * (b.rate / 100);
    prevMax = b.max;
    if (quotient <= b.max) break;
  }
  return tax * (parts || 1);
}

function estimateAnnualNetFromBrut(annualBrut) {
  const parts = getTaxParts();
  const tax = calcProgressiveTax(annualBrut, parts);
  return { brut: annualBrut, tax, net: annualBrut - tax, tauxEffectif: annualBrut > 0 ? (tax / annualBrut) * 100 : 0 };
}

function estimateCurrentAnnualBrut() {
  if (!remuneration.enabled || !remuneration.tauxHoraire) return 0;
  const now = new Date();
  const year = now.getFullYear();
  let totalBrut = 0;
  let monthsWithData = 0;
  for (let m = 0; m <= now.getMonth(); m++) {
    const gm = calcGainsMois(year, m) + getPrimesForMonth(year, m);
    if (gm > 0) { totalBrut += gm; monthsWithData++; }
  }
  if (!monthsWithData) return 0;
  return (totalBrut / monthsWithData) * 12;
}

function renderTaxSimulator() {
  const el = document.getElementById('taxSimulatorResult');
  if (!el) return;
  const inputEl = document.getElementById('taxSimAnnualBrutInput');
  const partsEl = document.getElementById('taxSimPartsInput');

  const estimatedBrut = estimateCurrentAnnualBrut();
  if (inputEl && !inputEl.value && estimatedBrut > 0) inputEl.value = Math.round(estimatedBrut);
  if (partsEl) partsEl.value = getTaxParts();

  const brut = inputEl && inputEl.value ? Number(inputEl.value) : estimatedBrut;
  if (!brut) {
    el.innerHTML = `<div style="font-size:12px;color:var(--muted);">Renseigne un revenu brut annuel (ou active la rémunération pour une estimation automatique).</div>`;
    return;
  }

  const result = estimateAnnualNetFromBrut(brut);
  const brackets = getTaxBrackets();
  const parts = getTaxParts();
  const quotient = brut / parts;

  let bracketsHtml = '<div style="margin-top:10px;">';
  let prevMax = 0;
  brackets.forEach(b => {
    if (quotient <= prevMax) return;
    const active = quotient > prevMax;
    const label = b.max === Infinity ? `> ${prevMax.toLocaleString('fr-FR')} €` : `${prevMax.toLocaleString('fr-FR')} – ${b.max.toLocaleString('fr-FR')} €`;
    bracketsHtml += `<div style="display:flex;justify-content:space-between;font-size:11px;color:${active ? 'var(--text)' : 'var(--muted)'};padding:3px 0;">
      <span>${label}</span><span style="font-weight:700;">${b.rate}%</span>
    </div>`;
    prevMax = b.max;
  });
  bracketsHtml += '</div>';

  el.innerHTML = `
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Revenu net estimé (annuel)</span>
        <span class="objectif-values" style="color:var(--green)">${fmtEuros(result.net)}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">
        Impôt estimé : <strong style="color:var(--accent2)">${fmtEuros(result.tax)}</strong> · Taux effectif : <strong>${result.tauxEffectif.toFixed(1)}%</strong> · ${parts} part${parts !== 1 ? 's' : ''}
      </div>
      ${bracketsHtml}
      <div style="font-size:10px;color:var(--muted);margin-top:10px;line-height:1.4;">
        Estimation simplifiée par tranches (quotient familial), hors crédits/réductions d'impôt et prélèvements sociaux. Ne remplace pas un calcul officiel.
      </div>
    </div>
  `;
}

function onTaxSimInputChange() {
  renderTaxSimulator();
}

function onTaxSimPartsChange() {
  const el = document.getElementById('taxSimPartsInput');
  if (el) saveTaxParts(Number(el.value));
  renderTaxSimulator();
}

function openTaxSimulatorSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-taxsim-settings').classList.add('active');
  renderTaxSimulator();
}

// ══════════════════════════════════════════════════════════
// ALERTE SEUIL DE RÉMUNÉRATION ANNUELLE (changement de tranche fiscale)
// Compare le brut annuel projeté (rythme actuel) aux seuils du barème fiscal
// et alerte si l'utilisateur est en passe de franchir une tranche supérieure,
// afin d'anticiper (ex: arbitrer une prime, un rachat de RTT, etc.).
// ══════════════════════════════════════════════════════════

function getTaxThresholdAlertEnabled() {
  return localStorage.getItem('orvia_tax_threshold_alert_enabled') !== 'false';
}

function setTaxThresholdAlertEnabled(val) {
  localStorage.setItem('orvia_tax_threshold_alert_enabled', val ? 'true' : 'false');
}

function findNextTaxThreshold(projectedBrut, parts) {
  const brackets = getTaxBrackets();
  const quotient = projectedBrut / (parts || 1);
  for (const b of brackets) {
    if (quotient < b.max) {
      return { thresholdQuotient: b.max, thresholdBrut: b.max * parts, rate: b.rate };
    }
  }
  return null;
}

function checkTaxThresholdProximity() {
  if (!getTaxThresholdAlertEnabled() || !remuneration.enabled || !remuneration.tauxHoraire) return;
  const projectedBrut = estimateCurrentAnnualBrut();
  if (!projectedBrut) return;
  const parts = getTaxParts();
  const next = findNextTaxThreshold(projectedBrut, parts);
  if (!next) return;

  const distancePct = ((next.thresholdBrut - projectedBrut) / next.thresholdBrut) * 100;
  const now = new Date();
  const alertKey = 'orvia_tax_alert_shown_' + now.getFullYear() + '_' + Math.round(next.thresholdBrut);

  if (distancePct > 0 && distancePct <= 8 && !localStorage.getItem(alertKey)) {
    localStorage.setItem(alertKey, '1');
    const msg = `⚠️ À ce rythme, ton revenu annuel (${fmtEuros(projectedBrut)}) approche du seuil de tranche fiscale à ${fmtEuros(next.thresholdBrut)} (passage à ${next.rate}%).`;
    showToast(msg);
    if (('Notification' in window) && Notification.permission === 'granted') {
      orviaNotify('Seuil de tranche fiscale proche', { body: msg });
    }
  }
}

function renderTaxThresholdBanner() {
  const el = document.getElementById('taxThresholdBanner');
  if (!el) return;
  if (!getTaxThresholdAlertEnabled() || !remuneration.enabled || !remuneration.tauxHoraire) {
    el.style.display = 'none';
    return;
  }
  const projectedBrut = estimateCurrentAnnualBrut();
  if (!projectedBrut) { el.style.display = 'none'; return; }
  const parts = getTaxParts();
  const next = findNextTaxThreshold(projectedBrut, parts);
  if (!next) { el.style.display = 'none'; return; }

  const distancePct = ((next.thresholdBrut - projectedBrut) / next.thresholdBrut) * 100;
  if (distancePct <= 0 || distancePct > 8) { el.style.display = 'none'; return; }

  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:rgba(245,158,11,.12);border:1px solid var(--orange);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--orange);font-size:13px;">⚠️ Seuil de tranche fiscale proche</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">Brut projeté : ${fmtEuros(projectedBrut)} · Seuil : ${fmtEuros(next.thresholdBrut)} (passage à ${next.rate}%)</div>
    </div>
  `;
}

function onTaxThresholdAlertToggle() {
  const el = document.getElementById('taxThresholdAlertEnabled');
  setTaxThresholdAlertEnabled(el ? el.checked : true);
  showToast('Réglages mis à jour ✓');
  renderTaxThresholdBanner();
}

function renderTaxThresholdSettings() {
  const el = document.getElementById('taxThresholdAlertEnabled');
  if (el) el.checked = getTaxThresholdAlertEnabled();
}

// ── THÈMES SAISONNIERS (dégradés) ──
// Palettes visuelles thématiques appliquant un dégradé de fond sur l'en-tête,
// la carte horloge et la barre d'onglets, en plus de teinter accent/accent2.
const SEASONAL_THEMES = [
  { id: 'printemps', name: '🌸 Printemps', accent: '#22c55e', accent2: '#ec4899', gradient: 'linear-gradient(135deg, #34d399, #f472b6)' },
  { id: 'ete', name: '☀️ Été', accent: '#f59e0b', accent2: '#3b82f6', gradient: 'linear-gradient(135deg, #fbbf24, #38bdf8)' },
  { id: 'automne', name: '🍂 Automne', accent: '#ea580c', accent2: '#92400e', gradient: 'linear-gradient(135deg, #f97316, #78350f)' },
  { id: 'hiver', name: '❄️ Hiver', accent: '#3b82f6', accent2: '#a5b4fc', gradient: 'linear-gradient(135deg, #1e3a8a, #93c5fd)' },
  { id: 'noel', name: '🎄 Noël', accent: '#ef4444', accent2: '#16a34a', gradient: 'linear-gradient(135deg, #b91c1c, #14532d)' },
  { id: 'coucherdesoleil', name: '🌇 Coucher de soleil', accent: '#f97316', accent2: '#db2777', gradient: 'linear-gradient(135deg, #f97316, #db2777, #7c3aed)' },
  { id: 'aurore', name: '🌌 Aurore boréale', accent: '#06b6d4', accent2: '#8b5cf6', gradient: 'linear-gradient(135deg, #06b6d4, #22c55e, #8b5cf6)' },
  { id: 'sakura', name: '🌷 Sakura', accent: '#f9a8d4', accent2: '#a78bfa', gradient: 'linear-gradient(135deg, #fbcfe8, #c4b5fd)' }
];

function getCurrentThemeId() {
  return localStorage.getItem('orvia_theme') || 'violet';
}

function getCurrentSeasonalId() {
  return localStorage.getItem('orvia_seasonal_theme') || '';
}

function getCurrentMode() {
  return localStorage.getItem('orvia_mode') || 'dark';
}

function applyMode(mode) {
  const m = mode === 'light' ? 'light' : 'dark';
  if (m === 'light') {
    document.documentElement.classList.add('light-mode');
  } else {
    document.documentElement.classList.remove('light-mode');
  }
  localStorage.setItem('orvia_mode', m);
}

function applyTheme(themeId) {
  const theme = THEME_PALETTES.find(t => t.id === themeId) || THEME_PALETTES[0];
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--accent2', theme.accent2);
  localStorage.setItem('orvia_theme', theme.id);
  // Choisir une couleur solide désactive le dégradé saisonnier actif.
  document.documentElement.classList.remove('has-seasonal');
  localStorage.removeItem('orvia_seasonal_theme');
}

function applySeasonalTheme(seasonalId) {
  const theme = SEASONAL_THEMES.find(t => t.id === seasonalId);
  if (!theme) return;
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--accent2', theme.accent2);
  document.documentElement.style.setProperty('--seasonal-gradient', theme.gradient);
  document.documentElement.classList.add('has-seasonal');
  localStorage.setItem('orvia_seasonal_theme', theme.id);
}

function clearSeasonalTheme() {
  document.documentElement.classList.remove('has-seasonal');
  localStorage.removeItem('orvia_seasonal_theme');
  applyTheme(getCurrentThemeId());
}

// Applique au démarrage de l'app le dégradé saisonnier sauvegardé (s'il y en a un).
function initSeasonalTheme() {
  const seasonalId = getCurrentSeasonalId();
  if (seasonalId) {
    const theme = SEASONAL_THEMES.find(t => t.id === seasonalId);
    if (theme) {
      document.documentElement.style.setProperty('--accent', theme.accent);
      document.documentElement.style.setProperty('--accent2', theme.accent2);
      document.documentElement.style.setProperty('--seasonal-gradient', theme.gradient);
      document.documentElement.classList.add('has-seasonal');
    }
  }
}

function renderModeSwitch() {
  const container = document.getElementById('modeSwitch');
  if (!container) return;
  const current = getCurrentMode();
  const modes = [
    { id: 'dark', label: '🌙 Sombre' },
    { id: 'light', label: '☀️ Clair' }
  ];
  container.innerHTML = modes.map(m => `
    <button onclick="selectMode('${m.id}')" style="flex:1;padding:10px;border-radius:10px;border:2px solid ${current === m.id ? 'var(--accent)' : 'var(--border)'};background:${current === m.id ? 'var(--accent)' : 'transparent'};color:${current === m.id ? '#fff' : 'var(--text)'};font-weight:700;font-size:13px;cursor:pointer;">
      ${m.label}
    </button>
  `).join('');
}

function selectMode(mode) {
  applyMode(mode);
  renderModeSwitch();
  showToast(mode === 'light' ? 'Mode clair activé ☀️' : 'Mode sombre activé 🌙');
  if (document.getElementById('page-history').classList.contains('active')) renderTrendChart();
}

function renderThemePicker() {
  const container = document.getElementById('themeSwatches');
  if (!container) return;
  const current = getCurrentThemeId();
  const seasonalActive = getCurrentSeasonalId();
  container.innerHTML = THEME_PALETTES.map(t => `
    <div onclick="selectTheme('${t.id}')" style="cursor:pointer;text-align:center;">
      <div style="width:100%;aspect-ratio:1;border-radius:14px;background:linear-gradient(135deg, ${t.accent}, ${t.accent2});border:3px solid ${(!seasonalActive && current === t.id) ? '#fff' : 'transparent'};box-shadow:${(!seasonalActive && current === t.id) ? '0 0 0 2px ' + t.accent : 'none'};display:flex;align-items:center;justify-content:center;font-size:18px;">
        ${(!seasonalActive && current === t.id) ? '✓' : ''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">${t.name}</div>
    </div>
  `).join('');
  renderModeSwitch();
  renderSeasonalThemePicker();
}

function selectTheme(themeId) {
  applyTheme(themeId);
  renderThemePicker();
  showToast('Thème appliqué ✓');
  if (document.getElementById('page-history').classList.contains('active')) renderTrendChart();
}

function renderSeasonalThemePicker() {
  const container = document.getElementById('seasonalThemeSwatches');
  if (!container) return;
  const current = getCurrentSeasonalId();
  container.innerHTML = SEASONAL_THEMES.map(t => `
    <div onclick="selectSeasonalTheme('${t.id}')" style="cursor:pointer;text-align:center;">
      <div style="width:100%;aspect-ratio:1;border-radius:14px;background:${t.gradient};border:3px solid ${current === t.id ? '#fff' : 'transparent'};box-shadow:${current === t.id ? '0 0 0 2px ' + t.accent : 'none'};display:flex;align-items:center;justify-content:center;font-size:18px;">
        ${current === t.id ? '✓' : ''}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">${t.name}</div>
    </div>
  `).join('');
}

function selectSeasonalTheme(seasonalId) {
  applySeasonalTheme(seasonalId);
  renderThemePicker();
  showToast('Thème saisonnier appliqué ✓');
  if (document.getElementById('page-history').classList.contains('active')) renderTrendChart();
}

function resetSeasonalTheme() {
  clearSeasonalTheme();
  renderThemePicker();
  showToast('Retour à la couleur unie');
}

function exportThemeBackup() {
  const data = {
    theme: getCurrentThemeId(),
    mode: getCurrentMode(),
    seasonal: getCurrentSeasonalId()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orvia_theme.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Thème exporté');
}

function importThemeBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      const themeId = THEME_PALETTES.some(t => t.id === data.theme) ? data.theme : 'violet';
      const mode = data.mode === 'light' ? 'light' : 'dark';
      applyTheme(themeId);
      applyMode(mode);
      if (data.seasonal && SEASONAL_THEMES.some(t => t.id === data.seasonal)) {
        applySeasonalTheme(data.seasonal);
      }
      renderThemePicker();
      showToast('Thème importé ✓');
    } catch(err) {
      showToast('Fichier de thème invalide');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function baseAppUrl() {
  return window.location.origin + window.location.pathname;
}

function openCloudSyncSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-cloudsync-settings').classList.add('active');
  renderCloudSyncSettings();
}

async function renderCloudSyncSettings() {
  await refreshCloudUser();
  const loggedOutBox = document.getElementById('cloudSyncLoggedOutBox');
  const loggedInBox = document.getElementById('cloudSyncLoggedInBox');
  const summaryEl = document.getElementById('cloudSyncSummary');
  if (!loggedOutBox || !loggedInBox) return;

  if (_cloudUser) {
    loggedOutBox.style.display = 'none';
    loggedInBox.style.display = 'block';
    document.getElementById('cloudSyncEmailLabel').textContent = _cloudUser.email || '';
    const cfg = getSyncState();
    document.getElementById('cloudSyncLastSync').textContent = cfg.lastSyncTs
      ? 'Dernière synchronisation : ' + new Date(cfg.lastSyncTs).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
      : 'Pas encore synchronisé';
    if (summaryEl) summaryEl.textContent = 'Connecté — ' + (_cloudUser.email || '');
  } else {
    loggedOutBox.style.display = 'block';
    loggedInBox.style.display = 'none';
    if (summaryEl) summaryEl.textContent = 'Connexion par code email, sauvegarde automatique';
  }
}

async function onSendMagicLinkClick() {
  const input = document.getElementById('cloudSyncEmail');
  if (!input) return;
  const ok = await sendMagicLink(input.value);
  if (ok) {
    document.getElementById('cloudSyncStep1').style.display = 'none';
    document.getElementById('cloudSyncStep2').style.display = 'block';
    document.getElementById('cloudSyncEmailSent').textContent = input.value.trim();
    const codeInput = document.getElementById('cloudSyncCode');
    if (codeInput) { codeInput.value = ''; codeInput.focus(); }
  }
}

async function onVerifyCodeClick() {
  const codeInput = document.getElementById('cloudSyncCode');
  if (!codeInput) return;
  const ok = await verifyLoginCode(codeInput.value);
  if (ok) {
    // onAuthStateChange (SIGNED_IN) prend le relais : conflit cloud, badge, etc.
    document.getElementById('cloudSyncStep1').style.display = 'block';
    document.getElementById('cloudSyncStep2').style.display = 'none';
  }
}

async function verifyPastedLink(pastedText) {
  if (!sb) { showToast('Client cloud indisponible'); return false; }
  let url;
  try {
    url = new URL((pastedText || '').trim());
  } catch (e) {
    showToast("Ça ne ressemble pas à un lien valide");
    return false;
  }

  // Le jeton peut se trouver soit dans la query string (lien brut de l'email,
  // avant tout clic), soit dans le fragment #... (si le lien a déjà été suivi
  // et redirigé une première fois, ex: copié depuis la barre d'adresse Safari).
  const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
  const getParam = (name) => url.searchParams.get(name) || hashParams.get(name);

  const accessToken = getParam('access_token');
  const refreshToken = getParam('refresh_token');
  if (accessToken && refreshToken) {
    try {
      const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) { showToast('Session invalide ou expirée : ' + error.message); return false; }
      return true;
    } catch (e) {
      showToast('Erreur réseau lors de la connexion');
      return false;
    }
  }

  const tokenHash = getParam('token_hash') || getParam('token');
  const type = getParam('type') || 'email';
  if (!tokenHash) {
    showToast("Aucun jeton trouvé dans ce lien — copiez le lien directement depuis l'email, sans avoir cliqué dessus avant");
    return false;
  }
  try {
    const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) { showToast('Lien invalide ou expiré : ' + error.message); return false; }
    return true;
  } catch (e) {
    showToast('Erreur réseau lors de la vérification');
    return false;
  }
}

async function onVerifyPastedLinkClick() {
  const input = document.getElementById('cloudSyncPastedLink');
  if (!input) return;
  const ok = await verifyPastedLink(input.value);
  if (ok) {
    document.getElementById('cloudSyncStep1').style.display = 'block';
    document.getElementById('cloudSyncStep2').style.display = 'none';
  }
}

function onResendCodeClick() {
  _pendingLoginEmail = null;
  document.getElementById('cloudSyncStep1').style.display = 'block';
  document.getElementById('cloudSyncStep2').style.display = 'none';
}

async function manualPushToCloud() {
  showToast('Envoi en cours…');
  const ok = await pushToCloud();
  if (ok) {
    saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
    renderSyncStatusBadge();
    renderCloudSyncSettings();
    showToast('☁️ Sauvegardé dans le cloud ✓');
  } else {
    showToast('Échec de la sauvegarde cloud');
  }
}

async function manualPullFromCloud() {
  const remote = await pullFromCloud();
  if (!remote || !remote.data) {
    showToast('Aucune sauvegarde cloud trouvée');
    return;
  }
  if (!confirm('Remplacer les données de cet appareil par celles du cloud ? Cette action écrase les données locales.')) return;
  applyCloudBackup(remote.data);
  saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
  renderSyncStatusBadge();
  showToast('☁️ Données restaurées depuis le cloud ✓');
}

function openWorkModeSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-workmode-settings').classList.add('active');
  renderWorkModeSettings();
}

function renderWorkModeSettings() {
  const cfg = getWorkModeConfig();
  const enabledEl = document.getElementById('workModeEnabled');
  const radiusEl = document.getElementById('workModeRadius');
  const labelEl = document.getElementById('workModeLocationLabel');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (radiusEl) radiusEl.value = String(cfg.radiusM);
  if (labelEl) {
    labelEl.textContent = (cfg.lat !== null && cfg.lng !== null)
      ? (cfg.label || `${cfg.lat.toFixed(5)}, ${cfg.lng.toFixed(5)}`)
      : 'Non défini';
  }
  updateWorkModeSummary();
  renderGeofenceSettings();
}

function updateWorkModeSummary() {
  const el = document.getElementById('workModeSummary');
  if (!el) return;
  const cfg = getWorkModeConfig();
  if (!cfg.enabled) { el.textContent = 'Désactivé'; return; }
  if (cfg.lat === null) { el.textContent = 'Activé — lieu de référence à définir'; return; }
  el.textContent = `Activé — rayon ${cfg.radiusM >= 1000 ? (cfg.radiusM/1000)+' km' : cfg.radiusM+' m'}`;
}

function onWorkModeToggle() {
  const cfg = getWorkModeConfig();
  const enabledEl = document.getElementById('workModeEnabled');
  cfg.enabled = enabledEl ? enabledEl.checked : false;
  saveWorkModeConfig(cfg);
  updateWorkModeSummary();
  showToast(cfg.enabled ? 'Détection activée ✓' : 'Détection désactivée');
}

function onWorkModeRadiusChange() {
  const cfg = getWorkModeConfig();
  const radiusEl = document.getElementById('workModeRadius');
  const allowed = [100, 300, 500, 1000];
  cfg.radiusM = radiusEl && allowed.includes(Number(radiusEl.value)) ? Number(radiusEl.value) : 300;
  saveWorkModeConfig(cfg);
  updateWorkModeSummary();
  showToast('Rayon mis à jour ✓');
}

async function captureWorkLocation() {
  showToast('Localisation en cours… 📍');
  const geo = await getGeo();
  if (!geo) {
    showToast("Impossible d'obtenir votre position");
    return;
  }
  const cfg = getWorkModeConfig();
  cfg.lat = Number(geo.lat);
  cfg.lng = Number(geo.lng);
  cfg.label = geo.label || '';
  saveWorkModeConfig(cfg);
  renderWorkModeSettings();
  showToast('Lieu de travail enregistré ✓');
}

