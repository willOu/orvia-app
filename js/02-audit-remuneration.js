// ── AUDIT TRAIL (HISTORIQUE DES MODIFICATIONS MANUELLES) ──
// Trace chaque modification manuelle effectuée sur les données sensibles
// (sessions, congés, taux horaires, primes) : quoi, quand, et un résumé
// avant/après. Utile pour retrouver l'origine d'une correction ultérieure.
const AUDIT_LOG_MAX_ENTRIES = 300;
let auditLog = [];

function loadAuditLog() {
  try {
    const raw = localStorage.getItem('orvia_audit_log');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) auditLog = parsed.slice(0, AUDIT_LOG_MAX_ENTRIES);
  } catch (e) {}
}

function saveAuditLog() {
  localStorage.setItem('orvia_audit_log', JSON.stringify(auditLog.slice(0, AUDIT_LOG_MAX_ENTRIES)));
}

// category: 'session' | 'conge' | 'taux' | 'prime'
// action: 'création' | 'modification' | 'suppression'
function logAuditEntry(category, action, summary) {
  auditLog.unshift({
    id: Date.now() + Math.floor(Math.random() * 100000),
    ts: Date.now(),
    category,
    action,
    summary: (summary || '').slice(0, 160)
  });
  if (auditLog.length > AUDIT_LOG_MAX_ENTRIES) auditLog.length = AUDIT_LOG_MAX_ENTRIES;
  saveAuditLog();
}

function clearAuditLog() {
  if (!confirm('Effacer tout l\'historique des modifications ? Cette action est irréversible.')) return;
  auditLog = [];
  saveAuditLog();
  renderAuditLogList();
  showToast('Historique des modifications effacé');
}

const AUDIT_CATEGORY_ICONS = { session: '⏱️', conge: '📅', taux: '💶', prime: '🎁' };
const AUDIT_CATEGORY_LABELS = { session: 'Session', conge: 'Congé', taux: 'Taux horaire', prime: 'Prime' };
const AUDIT_ACTION_COLORS = { 'création': 'var(--green)', 'modification': 'var(--orange)', 'suppression': 'var(--accent2)' };

function openAuditLogSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-auditlog-settings').classList.add('active');
  renderAuditLogList();
}

function renderAuditLogList() {
  const el = document.getElementById('auditLogList');
  if (!el) return;
  if (!auditLog.length) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Aucune modification enregistrée pour le moment.</div></div>';
    return;
  }
  el.innerHTML = auditLog.map(e => {
    const icon = AUDIT_CATEGORY_ICONS[e.category] || '📝';
    const catLabel = AUDIT_CATEGORY_LABELS[e.category] || e.category;
    const actionColor = AUDIT_ACTION_COLORS[e.action] || 'var(--muted)';
    const d = new Date(e.ts);
    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `
    <div class="settings-card" style="margin-bottom:8px;padding:12px 14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
        <span style="font-weight:700;font-size:13px;color:var(--text);">${icon} ${catLabel} — <span style="color:${actionColor};">${e.action}</span></span>
        <span style="font-size:11px;color:var(--muted);white-space:nowrap;">${dateStr} ${timeStr}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);">${escapeHtml(e.summary)}</div>
    </div>
  `;
  }).join('');
}

function load() {
  try {
    const n = localStorage.getItem('orvia_note_en_cours');
    const cur = localStorage.getItem('timetracker_current');
    const curStatus = cur ? (JSON.parse(cur).status || 'idle') : 'idle';
    if (n !== null && curStatus !== 'idle') {
      const ni = document.getElementById('noteInput');
      if (ni) ni.value = n;
    } else if (n !== null) {
      localStorage.removeItem('orvia_note_en_cours');
    }
  } catch(e) {}
  try {
    const s = localStorage.getItem('timetracker_sessions');
    if (s) state.sessions = JSON.parse(s);
    const c = localStorage.getItem('timetracker_current');
    if (c) {
      const cur = JSON.parse(c);
      state.status = cur.status;
      state.startTs = cur.startTs;
      state.pauseStart = cur.pauseStart;
      state.totalPauseMs = cur.totalPauseMs;
      state.startGeo = cur.startGeo || null;
      state.workMode = cur.workMode || null;
    }
  } catch(e) {}
}

function saveObjectifs() {
  localStorage.setItem('timetracker_objectifs', JSON.stringify(objectifs));
}

function loadObjectifs() {
  try {
    const o = localStorage.getItem('timetracker_objectifs');
    if (o) {
      const parsed = JSON.parse(o);
      objectifs = Object.assign({ jour:8*3600000, semaine:35*3600000, parJour:{1:8*3600000,2:8*3600000,3:8*3600000,4:8*3600000,5:8*3600000,6:0,0:0} }, parsed);
      if (!objectifs.parJour) objectifs.parJour = {1:8*3600000,2:8*3600000,3:8*3600000,4:8*3600000,5:8*3600000,6:0,0:0};
    }
  } catch(e) {}
}

// ── REMUNERATION ──
let remuneration = {
  enabled: false,
  tauxHoraire: 0,
  seuil1: 35,
  seuil2: 39,
  majorationTranche1: 25,
  majorationTranche2: 50,   remuSupEnabled: true,
  netEnabled: false,
  tauxImposition: 22
};

function saveRemuneration() {
  localStorage.setItem('orvia_remuneration', JSON.stringify(remuneration));
}

function loadRemuneration() {
  try {
    const r = localStorage.getItem('orvia_remuneration');
    if (r) {
      const parsed = JSON.parse(r);
      remuneration = Object.assign({
        enabled: false, tauxHoraire: 0, seuil1: 35, seuil2: 39,
        majorationTranche1: 25, majorationTranche2: 50,   remuSupEnabled: true,
        netEnabled: false, tauxImposition: 22
      }, parsed);
    }
  } catch(e) {}
}

// ── HISTORIQUE DES TAUX HORAIRES ──
// Garde trace des augmentations (ou baisses) de salaire dans le temps, afin
// que les calculs de gains rétroactifs sur d'anciennes sessions restent
// corrects même après une revalorisation du taux horaire actuel.
let tauxHoraireHistory = [];

function saveTauxHoraireHistory() {
  localStorage.setItem('orvia_taux_historique', JSON.stringify(tauxHoraireHistory));
}

function loadTauxHoraireHistory() {
  try {
    const raw = localStorage.getItem('orvia_taux_historique');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      tauxHoraireHistory = parsed
        .filter(e => e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(Number(e.taux)))
        .map(e => ({
          id: Number.isFinite(e.id) ? e.id : (Date.now() + Math.floor(Math.random() * 100000)),
          date: e.date,
          taux: clampNumber(Number(e.taux), 0, 1000, 0),
          note: typeof e.note === 'string' ? e.note.slice(0, 60) : ''
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch (e) {}
}

// Retourne le taux horaire applicable à une date (YYYY-MM-DD) : le dernier
// changement enregistré à une date <= dateStr, sinon le taux actuel des
// réglages (compatibilité avec les sessions antérieures au 1er changement
// et avec les comptes qui n'utilisent pas encore l'historique).
function getTauxHoraireForDate(dateStr) {
  if (!tauxHoraireHistory.length) return remuneration.tauxHoraire;
  let applicable = null;
  for (const entry of tauxHoraireHistory) {
    if (entry.date <= dateStr) applicable = entry;
    else break;
  }
  return applicable ? applicable.taux : remuneration.tauxHoraire;
}

function addTauxHoraireEntry(dateStr, taux, note) {
  const clean = clampNumber(Number(taux), 0, 1000, 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !clean) return false;
  tauxHoraireHistory = tauxHoraireHistory.filter(e => e.date !== dateStr);
  tauxHoraireHistory.push({
    id: Date.now() + Math.floor(Math.random() * 100000),
    date: dateStr,
    taux: clean,
    note: (note || '').slice(0, 60)
  });
  tauxHoraireHistory.sort((a, b) => a.date.localeCompare(b.date));
  saveTauxHoraireHistory();
  logAuditEntry('taux', 'création', `${clean} €/h à partir du ${dateStr}${note ? ' (' + note + ')' : ''}`);
  return true;
}

function deleteTauxHoraireEntry(id) {
  const deleted = tauxHoraireHistory.find(e => e.id === id);
  tauxHoraireHistory = tauxHoraireHistory.filter(e => e.id !== id);
  saveTauxHoraireHistory();
  if (deleted) logAuditEntry('taux', 'suppression', `${deleted.taux} €/h à partir du ${deleted.date}`);
  renderTauxHoraireHistoList();
  renderToday();
  showToast('Entrée supprimée');
}

// Ajoute automatiquement une entrée d'historique datée d'aujourd'hui quand
// l'utilisateur modifie le taux horaire courant dans les réglages, pour que
// l'historique reste à jour sans action supplémentaire de sa part.
function recordCurrentTauxIfChanged(newTaux) {
  const today = toLocalISO(new Date());
  const lastEntry = tauxHoraireHistory[tauxHoraireHistory.length - 1];
  if (lastEntry && lastEntry.date === today) {
    lastEntry.taux = newTaux;
    saveTauxHoraireHistory();
    return;
  }
  if (!lastEntry || lastEntry.taux !== newTaux) {
    addTauxHoraireEntry(today, newTaux, 'Mise à jour depuis les réglages');
  }
  renderTauxHoraireHistoList();
}

// ── HISTORIQUE DES PRIMES PONCTUELLES ──
// Enregistre les primes exceptionnelles (13e mois, prime de vacances, prime
// exceptionnelle...) datées et catégorisées, distinctes du salaire horaire.
// Elles s'ajoutent aux gains du mois concerné dans les calculs de rémunération.
const PRIME_TYPES = [
  { id: '13eme', label: '🎁 13e mois' },
  { id: 'vacances', label: '🏖️ Prime de vacances' },
  { id: 'exceptionnelle', label: '⭐ Prime exceptionnelle' },
  { id: 'anciennete', label: '📅 Prime d\'ancienneté' },
  { id: 'autre', label: '💰 Autre prime' }
];

let primesHistory = [];

function savePrimesHistory() {
  localStorage.setItem('orvia_primes_historique', JSON.stringify(primesHistory));
}

function loadPrimesHistory() {
  try {
    const raw = localStorage.getItem('orvia_primes_historique');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      primesHistory = parsed
        .filter(e => e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(Number(e.montant)))
        .map(e => ({
          id: Number.isFinite(e.id) ? e.id : (Date.now() + Math.floor(Math.random() * 100000)),
          date: e.date,
          montant: clampNumber(Number(e.montant), 0, 1000000, 0),
          type: PRIME_TYPES.some(t => t.id === e.type) ? e.type : 'autre',
          note: typeof e.note === 'string' ? e.note.slice(0, 60) : ''
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
    }
  } catch (e) {}
}

function addPrimeEntry(dateStr, montant, type, note) {
  const clean = clampNumber(Number(montant), 0, 1000000, 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !clean) return false;
  const finalType = PRIME_TYPES.some(t => t.id === type) ? type : 'autre';
  primesHistory.push({
    id: Date.now() + Math.floor(Math.random() * 100000),
    date: dateStr,
    montant: clean,
    type: finalType,
    note: (note || '').slice(0, 60)
  });
  primesHistory.sort((a, b) => b.date.localeCompare(a.date));
  savePrimesHistory();
  logAuditEntry('prime', 'création', `${clean} € (${finalType}) le ${dateStr}${note ? ' — ' + note : ''}`);
  return true;
}

function deletePrimeEntry(id) {
  const deleted = primesHistory.find(e => e.id === id);
  primesHistory = primesHistory.filter(e => e.id !== id);
  savePrimesHistory();
  if (deleted) logAuditEntry('prime', 'suppression', `${deleted.montant} € (${deleted.type}) du ${deleted.date}`);
  renderPrimesHistoList();
  renderToday();
  showToast('Prime supprimée');
}

// Total des primes perçues sur un mois donné (year: 4 chiffres, month: 0-11).
function getPrimesForMonth(year, month) {
  return primesHistory
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((a, e) => a + e.montant, 0);
}

// Total des primes perçues sur une année donnée.
function getPrimesForYear(year) {
  return primesHistory
    .filter(e => new Date(e.date + 'T00:00:00').getFullYear() === year)
    .reduce((a, e) => a + e.montant, 0);
}

function submitPrimeEntry() {
  const dateEl = document.getElementById('primeDateInput');
  const montantEl = document.getElementById('primeMontantInput');
  const typeEl = document.getElementById('primeTypeInput');
  const noteEl = document.getElementById('primeNoteInput');
  const dateStr = dateEl ? dateEl.value : '';
  const montant = montantEl ? Number(montantEl.value) : NaN;
  const type = typeEl ? typeEl.value : 'autre';
  if (!dateStr || !Number.isFinite(montant) || montant <= 0) {
    showToast('Date et montant valides requis');
    return;
  }
  const ok = addPrimeEntry(dateStr, montant, type, noteEl ? noteEl.value : '');
  if (!ok) { showToast('Prime invalide'); return; }
  if (dateEl) dateEl.value = '';
  if (montantEl) montantEl.value = '';
  if (noteEl) noteEl.value = '';
  renderPrimesHistoList();
  renderToday();
  showToast('Prime ajoutée ✓');
}

function renderPrimesHistoList() {
  const el = document.getElementById('primesHistoList');
  if (!el) return;
  if (!primesHistory.length) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Aucune prime enregistrée pour le moment.</div></div>';
    return;
  }
  el.innerHTML = primesHistory.map(e => {
    const typeInfo = PRIME_TYPES.find(t => t.id === e.type) || PRIME_TYPES[PRIME_TYPES.length - 1];
    return `
    <div class="settings-card" style="margin-bottom:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:700;color:var(--text);font-size:14px;">${typeInfo.label} — ${fmtEuros(e.montant)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">${e.date}${e.note ? ' — ' + escapeHtml(e.note) : ''}</div>
      </div>
      <button onclick="deletePrimeEntry(${e.id})" style="background:none;border:none;color:var(--accent2);font-size:18px;cursor:pointer;padding:4px 8px;">🗑</button>
    </div>
  `;
  }).join('');
}

function openPrimesSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-primes-settings').classList.add('active');
  renderPrimesHistoList();
}

// ── COMPARATEUR AVANT/APRÈS AUGMENTATION ──
// Projette l'impact d'un changement de taux horaire sur le revenu annuel
// estimé, en se basant sur la moyenne réelle d'heures travaillées par
// semaine (calculée sur les sessions enregistrées) et sur les primes
// annuelles moyennes déjà présentes dans l'historique des primes.
function getAverageWeeklyNetMs(weeksBack) {
  if (!state.sessions.length) return 0;
  const now = Date.now();
  const cutoff = weeksBack ? now - weeksBack * 7 * 86400000 : 0;
  const relevant = state.sessions.filter(s => s.start >= cutoff);
  if (!relevant.length) return 0;

  const byWeek = {};
  relevant.forEach(s => {
    const mon = getMondayOf(new Date(s.start)).getTime();
    byWeek[mon] = (byWeek[mon] || 0) + (s.net || 0);
  });
  const weekKeys = Object.keys(byWeek);
  if (!weekKeys.length) return 0;
  const total = weekKeys.reduce((a, k) => a + byWeek[k], 0);
  return total / weekKeys.length;
}

// Estimation du revenu annuel brut pour un taux horaire donné, à partir
// d'une moyenne hebdomadaire d'heures nettes (en ms) et de primes annuelles.
function projectAnnualIncome(taux, avgWeeklyNetMs, seuil1, seuil2, maj1, maj2, annualPrimes) {
  if (!taux) return 0;
  const hoursH = avgWeeklyNetMs / 3600000;
  const weeklyGain = calcTrancheGainForRange(0, hoursH, taux, seuil1, seuil2, maj1, maj2);
  return weeklyGain * 52 + (annualPrimes || 0);
}

function getAnnualPrimesAverage() {
  if (!primesHistory.length) return 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const primeYears = primesHistory
    .map(p => new Date(p.date + 'T00:00:00').getFullYear())
    .filter(y => y <= currentYear);
  if (!primeYears.length) return 0;
  const minYear = Math.min(...primeYears);
  const span = currentYear - minYear + 1;
  let total = 0;
  for (let y = minYear; y <= currentYear; y++) total += getPrimesForYear(y);
  return total / span;
}

function openComparateurSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-comparateur-settings').classList.add('active');
  const avantEl = document.getElementById('comparateurTauxAvant');
  const apresEl = document.getElementById('comparateurTauxApres');
  const primesEl = document.getElementById('comparateurPrimesInput');
  if (avantEl) avantEl.value = remuneration.tauxHoraire || '';
  if (apresEl) apresEl.value = '';
  if (primesEl) primesEl.value = Math.round(getAnnualPrimesAverage());
  renderComparateurResult();
}

function renderComparateurResult() {
  const el = document.getElementById('comparateurResult');
  if (!el) return;

  const avantEl = document.getElementById('comparateurTauxAvant');
  const apresEl = document.getElementById('comparateurTauxApres');
  const primesEl = document.getElementById('comparateurPrimesInput');
  const weeksBackEl = document.getElementById('comparateurWeeksBack');

  const tauxAvant = avantEl ? Number(avantEl.value) : 0;
  const tauxApres = apresEl ? Number(apresEl.value) : 0;
  const annualPrimes = primesEl ? Math.max(0, Number(primesEl.value) || 0) : 0;
  const weeksBack = weeksBackEl ? Number(weeksBackEl.value) : 12;

  if (!Number.isFinite(tauxAvant) || tauxAvant <= 0 || !Number.isFinite(tauxApres) || tauxApres <= 0) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Renseigne un taux avant et un taux après pour lancer la comparaison.</div></div>';
    return;
  }

  const avgWeeklyNetMs = getAverageWeeklyNetMs(weeksBack);
  const avgWeeklyH = avgWeeklyNetMs / 3600000;

  if (avgWeeklyH <= 0) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Pas assez de sessions enregistrées récemment pour estimer une moyenne hebdomadaire fiable.</div></div>';
    return;
  }

  const seuil1 = remuneration.seuil1, seuil2 = remuneration.seuil2;
  const maj1 = remuneration.majorationTranche1, maj2 = remuneration.majorationTranche2;

  const annualAvant = projectAnnualIncome(tauxAvant, avgWeeklyNetMs, seuil1, seuil2, maj1, maj2, annualPrimes);
  const annualApres = projectAnnualIncome(tauxApres, avgWeeklyNetMs, seuil1, seuil2, maj1, maj2, annualPrimes);
  const diff = annualApres - annualAvant;
  const diffPct = annualAvant > 0 ? (diff / annualAvant) * 100 : 0;
  const diffColor = diff >= 0 ? 'var(--green)' : 'var(--accent2)';
  const diffSign = diff >= 0 ? '+' : '';

  el.innerHTML = `
    <div class="settings-card" style="margin-bottom:10px;padding:14px;">
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Basé sur une moyenne de ${avgWeeklyH.toFixed(1)}h travaillées/semaine sur les ${weeksBack} dernières semaines, primes annuelles incluses.</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;color:var(--muted);">Revenu annuel avant (${tauxAvant.toLocaleString('fr-FR')} €/h)</span>
        <span style="font-weight:700;color:var(--text);">${fmtEuros(annualAvant)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;color:var(--muted);">Revenu annuel après (${tauxApres.toLocaleString('fr-FR')} €/h)</span>
        <span style="font-weight:700;color:var(--text);">${fmtEuros(annualApres)}</span>
      </div>
      <div style="height:1px;background:var(--border);margin:10px 0;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:800;color:var(--text);">Différence annuelle</span>
        <span style="font-size:16px;font-weight:800;color:${diffColor};">${diffSign}${fmtEuros(diff)} (${diffSign}${diffPct.toFixed(1)}%)</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
        <span style="font-size:12px;color:var(--muted);">Différence mensuelle moyenne</span>
        <span style="font-size:13px;font-weight:700;color:${diffColor};">${diffSign}${fmtEuros(diff / 12)}</span>
      </div>
    </div>
  `;
}

function submitTauxHoraireHistoEntry() {
  const dateEl = document.getElementById('tauxHistoDateInput');
  const tauxEl = document.getElementById('tauxHistoTauxInput');
  const noteEl = document.getElementById('tauxHistoNoteInput');
  const dateStr = dateEl ? dateEl.value : '';
  const taux = tauxEl ? Number(tauxEl.value) : NaN;
  if (!dateStr || !Number.isFinite(taux) || taux <= 0) {
    showToast('Date et taux valides requis');
    return;
  }
  const ok = addTauxHoraireEntry(dateStr, taux, noteEl ? noteEl.value : '');
  if (!ok) { showToast('Entrée invalide'); return; }
  if (dateEl) dateEl.value = '';
  if (tauxEl) tauxEl.value = '';
  if (noteEl) noteEl.value = '';
  renderTauxHoraireHistoList();
  renderToday();
  showToast('Taux ajouté à l\'historique ✓');
}

function renderTauxHoraireHistoList() {
  const el = document.getElementById('tauxHoraireHistoList');
  if (!el) return;
  if (!tauxHoraireHistory.length) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Aucun changement de taux enregistré. Le taux horaire des réglages ci-dessus s\'applique à toutes les sessions.</div></div>';
    return;
  }
  const sorted = tauxHoraireHistory.slice().sort((a, b) => b.date.localeCompare(a.date));
  el.innerHTML = sorted.map(e => `
    <div class="settings-card" style="margin-bottom:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-weight:700;color:var(--text);font-size:14px;">${fmtEuros(e.taux)} / h</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px;">Depuis le ${e.date}${e.note ? ' — ' + escapeHtml(e.note) : ''}</div>
      </div>
      <button onclick="deleteTauxHoraireEntry(${e.id})" style="background:none;border:none;color:var(--accent2);font-size:18px;cursor:pointer;padding:4px 8px;">🗑</button>
    </div>
  `).join('');
}

// ── ARRONDI ──
let arrondi = { enabled: false, minutes: 15, mode: 'nearest' };

function saveArrondi() {
  localStorage.setItem('orvia_arrondi', JSON.stringify(arrondi));
}

function loadArrondi() {
  try {
    const a = localStorage.getItem('orvia_arrondi');
    if (a) {
      const parsed = JSON.parse(a);
      arrondi = Object.assign({ enabled: false, minutes: 15, mode: 'nearest' }, parsed);
    }
  } catch(e) {}
}

