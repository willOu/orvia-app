// ── CONGES ──
const CONGE_COLORS = { cp:'cp', rtt:'rtt' };
const CONGE_LABELS = { cp:'Congé payé', rtt:'RTT' }; let customCongeTypes = [];
const SOLDE_DEFAULTS = { cp:25, rtt:10 };

let calYear, calMonth;

function loadConges() {
  try {
    const c = localStorage.getItem('timetracker_conges');
    if (c) state.conges = JSON.parse(c);
    const q = localStorage.getItem('timetracker_quotas');
    if (q) state.quotas = JSON.parse(q);
    const l = localStorage.getItem('timetracker_labels');
    if (l) { const parsed = JSON.parse(l); Object.assign(CONGE_LABELS, parsed); }     const ct = localStorage.getItem('timetracker_custom_types');     if (ct) customCongeTypes = JSON.parse(ct);
  } catch(e) {}
  // Types "Congé sans solde" (css) et "Enfant malade" (csp) retirés de l'app :
  // on supprime les congés existants de ces types et les traces résiduelles
  // qui pourraient rester d'un ancien localStorage.
  const removedTypes = ['css', 'csp'];
  const hadRemovedConges = state.conges.some(c => removedTypes.includes(c.type));
  if (hadRemovedConges) state.conges = state.conges.filter(c => !removedTypes.includes(c.type));
  removedTypes.forEach(t => { delete state.quotas[t]; delete CONGE_LABELS[t]; });
  if (hadRemovedConges) saveConges();
}

function saveConges() {
  localStorage.setItem('timetracker_conges', JSON.stringify(state.conges));
  localStorage.setItem('timetracker_quotas', JSON.stringify(state.quotas));
  localStorage.setItem('timetracker_labels', JSON.stringify(CONGE_LABELS));   localStorage.setItem('timetracker_custom_types', JSON.stringify(customCongeTypes));
  if (typeof enqueueSyncChange === 'function') enqueueSyncChange('conges', 'Congés mis à jour');
}

function workdaysBetween(d1, d2) {
  let count = 0, cur = new Date(d1);
  cur.setHours(0,0,0,0);
  const end = new Date(d2); end.setHours(0,0,0,0);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !isDateHoliday(toLocalISO(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Jours ouvrables (lundi–samedi, hors jours fériés) : mode de décompte des congés payés du BTP.
function ouvrablesBetween(d1, d2) {
  let count = 0, cur = new Date(d1);
  cur.setHours(0,0,0,0);
  const end = new Date(d2); end.setHours(0,0,0,0);
  while (cur <= end) {
    if (cur.getDay() !== 0 && !isDateHoliday(toLocalISO(cur))) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Un congé payé est compté en jours ouvrables quand le mode BTP l'impose.
function congeUnitFor(type) {
  const cfg = getBTPConfig();
  return (type === 'cp' && cfg.enabled && cfg.ouvrables) ? 'ouv' : undefined;
}

function computeCongeDays(start, end, unit) {
  return unit === 'ouv' ? ouvrablesBetween(start, end) : workdaysBetween(start, end);
}

function addConge() {
    const type = document.getElementById('congeType').value;
    const startVal = document.getElementById('congeStart').value;
    const endVal = document.getElementById('congeEnd').value;
    const note = document.getElementById('congeNote').value.trim();
    if (!startVal) return showToast('Choisis une date de début');
    const endFinal = endVal || startVal;
    if (endFinal < startVal) return showToast('La date de fin doit être après le début');
    const unit = congeUnitFor(type);
    const days = computeCongeDays(startVal, endFinal, unit);
    // check quota (les types personnalisés n'ont pas de notion de quota : illimités)
    const isCustomType = customCongeTypes.some(t => t.id === type);
    if (!isCustomType) {
      const congeYear = Number(startVal.slice(0, 4));
      const taken = getCongesTakenForYear(type, congeYear);
      const quota = getEffectiveQuotaForYear(type, congeYear);
      if (taken + days > quota) {
        return showToast(`Erreur : quota dépassé pour ${type.toUpperCase()} (${taken}/${quota} jours utilisés, report inclus)`);
      }
    }
    // check overlap with existing conges
    let cur = new Date(startVal + 'T00:00:00');
    const endDate = new Date(endFinal + 'T00:00:00');
    while (cur <= endDate) {
      const dow = cur.getDay();
      if (dow !== 0 && (dow !== 6 || unit === 'ouv')) {
        const dateStr = toLocalISO(cur);
        const overlap = state.conges.find(c => {
          let d = new Date(c.start + 'T00:00:00');
          const e = new Date(c.end + 'T00:00:00');
          while (d <= e) {
            if (toLocalISO(d) === dateStr) return true;
            d.setDate(d.getDate() + 1);
          }
          return false;
        });
        if (overlap) {
          const labels = { cp: 'Congé payé', rtt: 'RTT' };
          return showToast(`Erreur : le ${dateStr} est déjà pris (${labels[overlap.type] || overlap.type})`);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    state.conges.push({ type, start: startVal, end: endFinal, note, days, ...(unit ? { unit } : {}), id: Date.now() + Math.floor(Math.random()*100000) });
    saveConges();
    logAuditEntry('conge', 'création', `${days} jour(s) de ${getCongeTypeLabel(type)} du ${startVal} au ${endFinal}`);
    document.getElementById('congeStart').value = '';
    document.getElementById('congeEnd').value = '';
    document.getElementById('congeNote').value = '';
    renderConges();
    showToast(`${days} jour(s) enregistrés`);
  }

let _undoDeleteConge = null;

function deleteConge(id) {
  const idx = state.conges.findIndex(c => c.id === id);
  if (idx === -1) return;
  if (_undoDeleteTimer) { clearTimeout(_undoDeleteTimer); _undoDeleteTimer = null; if (window._undoConfirm) { const f = window._undoConfirm; window._undoConfirm = null; f(); } }
  _undoDeleteConge = state.conges[idx];
  const deletedSummary = `${_undoDeleteConge.days} jour(s) de ${getCongeTypeLabel(_undoDeleteConge.type)} du ${_undoDeleteConge.start} au ${_undoDeleteConge.end}`;
  state.conges.splice(idx, 1);
  saveConges();
  renderConges();
  window._undoRestoreMsg = 'Congé restauré';
  showUndoToast('Congé supprimé', () => {
    if (_undoDeleteConge !== null) {
      state.conges.splice(idx, 0, _undoDeleteConge);
      state.conges.sort((a, b) => a.start.localeCompare(b.start));
      _undoDeleteConge = null;
      saveConges();
      renderConges();
    }
  }, () => {
    if (_undoDeleteConge !== null) {
      logAuditEntry('conge', 'suppression', deletedSummary);
    }
    _undoDeleteConge = null;
  });
}


const LOW_QUOTA_THRESHOLD = 3;

function getLowQuotaAlertState() {
  const raw = localStorage.getItem('orvia_low_quota_alert');
  if (!raw) return { lastDate: null, alerted: {} };
  try {
    const parsed = JSON.parse(raw);
    return {
      lastDate: typeof parsed.lastDate === 'string' ? parsed.lastDate : null,
      alerted: (parsed.alerted && typeof parsed.alerted === 'object') ? parsed.alerted : {}
    };
  } catch(e) {
    return { lastDate: null, alerted: {} };
  }
}

function saveLowQuotaAlertState(st) {
  localStorage.setItem('orvia_low_quota_alert', JSON.stringify(st));
}

// ── ALERTE SOLDE DE CONGÉS À RISQUE (péremption) ──
// Certains types de congés (CP notamment) doivent légalement être pris avant
// une date limite (souvent le 31 mai suivant la fin de la période
// d'acquisition en France) sous peine d'être perdus. Cette alerte prévient
// proactivement si un solde restant risque d'expirer.
function getCongeExpiryConfig() {
  try {
    const raw = localStorage.getItem('orvia_conge_expiry_config');
    if (!raw) return { enabled: true, deadlineMonth: 5, deadlineDay: 31, warningDays: 60, types: ['cp'] };
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled !== false,
      deadlineMonth: Number.isFinite(Number(p.deadlineMonth)) ? clampNumber(Number(p.deadlineMonth), 1, 12, 5) : 5,
      deadlineDay: Number.isFinite(Number(p.deadlineDay)) ? clampNumber(Number(p.deadlineDay), 1, 31, 31) : 31,
      warningDays: Number.isFinite(Number(p.warningDays)) ? clampNumber(Number(p.warningDays), 1, 365, 60) : 60,
      types: Array.isArray(p.types) && p.types.length ? p.types : ['cp']
    };
  } catch (e) {
    return { enabled: true, deadlineMonth: 5, deadlineDay: 31, warningDays: 60, types: ['cp'] };
  }
}

function saveCongeExpiryConfig(cfg) {
  localStorage.setItem('orvia_conge_expiry_config', JSON.stringify(cfg));
}

// Retourne la prochaine échéance légale (Date) : le mois/jour configuré,
// dans l'année courante si pas encore passé, sinon l'année suivante.
function getNextCongeDeadline(cfg) {
  const now = new Date();
  let deadline = new Date(now.getFullYear(), cfg.deadlineMonth - 1, cfg.deadlineDay, 23, 59, 59);
  if (deadline.getTime() < now.getTime()) {
    deadline = new Date(now.getFullYear() + 1, cfg.deadlineMonth - 1, cfg.deadlineDay, 23, 59, 59);
  }
  return deadline;
}

function getCongeExpiryRisks() {
  const cfg = getCongeExpiryConfig();
  if (!cfg.enabled) return [];
  const deadline = getNextCongeDeadline(cfg);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  if (daysLeft > cfg.warningDays || daysLeft < 0) return [];

  const risks = [];
  cfg.types.forEach(t => {
    const _yr = new Date().getFullYear();
    const quota = getEffectiveQuotaForYear(t, _yr);
    if (!quota || quota <= 0) return;
    const taken = getCongesTakenForYear(t, _yr);
    const left = Math.max(0, quota - taken);
    if (left > 0) {
      risks.push({ type: t, label: getCongeTypeLabel(t), left, daysLeft, deadline });
    }
  });
  return risks;
}

function renderCongeExpiryBanner() {
  const banner = document.getElementById('congeExpiryBanner');
  if (!banner) return;
  const risks = getCongeExpiryRisks();
  if (!risks.length) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  const deadlineStr = risks[0].deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const itemsHtml = risks.map(r => `${r.left} jour${r.left > 1 ? 's' : ''} de ${r.label}`).join(', ');
  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="background:rgba(239,68,68,.12);border:1px solid var(--accent2);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--accent2);font-size:13px;margin-bottom:4px;">⏳ Solde de congés à risque</div>
      <div style="font-size:12px;color:var(--muted);">${itemsHtml} à utiliser avant le ${deadlineStr} (dans ${risks[0].daysLeft} jour${risks[0].daysLeft > 1 ? 's' : ''}), sous peine de perte.</div>
    </div>`;
}

// Notification proactive une fois par jour si un solde est à risque.
function checkCongeExpiryNotification() {
  const risks = getCongeExpiryRisks();
  if (!risks.length) return;
  const today = todayKey();
  const lastNotifKey = 'orvia_conge_expiry_last_notif';
  if (localStorage.getItem(lastNotifKey) === today) return;
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  const itemsHtml = risks.map(r => `${r.left}j ${r.label}`).join(', ');
  if (canNotify) {
    orviaNotify('Congés à risque ⏳', { body: `${itemsHtml} à utiliser avant le ${risks[0].deadline.toLocaleDateString('fr-FR')}.` });
  }
  localStorage.setItem(lastNotifKey, today);
}

function openCongeExpirySettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-conge-expiry-settings').classList.add('active');
  renderCongeExpirySettingsForm();
}

function renderCongeExpirySettingsForm() {
  const cfg = getCongeExpiryConfig();
  const enabledEl = document.getElementById('congeExpiryEnabled');
  const monthEl = document.getElementById('congeExpiryMonth');
  const dayEl = document.getElementById('congeExpiryDay');
  const warnEl = document.getElementById('congeExpiryWarningDays');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (monthEl) monthEl.value = String(cfg.deadlineMonth);
  if (dayEl) dayEl.value = cfg.deadlineDay;
  if (warnEl) warnEl.value = cfg.warningDays;
  ['cp', 'rtt'].forEach(t => {
    const cb = document.getElementById('congeExpiryType_' + t);
    if (cb) cb.checked = cfg.types.includes(t);
  });
  renderCongeExpiryPreview();
}

function renderCongeExpiryPreview() {
  const el = document.getElementById('congeExpiryPreview');
  if (!el) return;
  const cfg = getCongeExpiryConfig();
  const deadline = getNextCongeDeadline(cfg);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  el.textContent = `Prochaine échéance : ${deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (dans ${daysLeft} jours)`;
}

function onCongeExpirySettingsChange() {
  const enabledEl = document.getElementById('congeExpiryEnabled');
  const monthEl = document.getElementById('congeExpiryMonth');
  const dayEl = document.getElementById('congeExpiryDay');
  const warnEl = document.getElementById('congeExpiryWarningDays');
  const types = ['cp', 'rtt'].filter(t => {
    const cb = document.getElementById('congeExpiryType_' + t);
    return cb && cb.checked;
  });
  const cfg = {
    enabled: enabledEl ? enabledEl.checked : true,
    deadlineMonth: monthEl ? clampNumber(Number(monthEl.value), 1, 12, 5) : 5,
    deadlineDay: dayEl ? clampNumber(Number(dayEl.value), 1, 31, 31) : 31,
    warningDays: warnEl ? clampNumber(Number(warnEl.value), 1, 365, 60) : 60,
    types: types.length ? types : ['cp']
  };
  saveCongeExpiryConfig(cfg);
  renderCongeExpiryPreview();
  renderCongeExpiryBanner();
  showToast('Réglages mis à jour ✓');
}

function checkLowQuotaAlerts() {
  const today = todayKey();
  let st = getLowQuotaAlertState();
  if (st.lastDate !== today) {
    st = { lastDate: today, alerted: {} };
  }

  const typesToCheck = ['cp', 'rtt'];
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';

  typesToCheck.forEach(t => {
    const _yr = new Date().getFullYear();
    const quota = getEffectiveQuotaForYear(t, _yr);
    if (!quota || quota <= 0) return;
    const taken = getCongesTakenForYear(t, _yr);
    const left = Math.max(0, quota - taken);

    if (left > 0 && left < LOW_QUOTA_THRESHOLD) {
      if (!st.alerted[t]) {
        st.alerted[t] = true;
        const label = CONGE_LABELS[t];
        const msg = `Il ne te reste que ${left} jour${left > 1 ? 's' : ''} de ${label}.`;
        if (canNotify) {
          orviaNotify('Quota bas ⚠️', { body: msg });
        }
        showToast(`⚠️ ${msg}`);
      }
    } else {
      st.alerted[t] = false;
    }
  });

  saveLowQuotaAlertState(st);
}

function getCongeTypeLabel(type) {
  if (CONGE_LABELS[type]) return CONGE_LABELS[type];
  const custom = customCongeTypes.find(t => t.id === type);
  return custom ? custom.label : type;
}

function getCongeTypeColor(type) {
  const base = { cp:'#6c63ff', rtt:'#3ecf8e' };
  if (base[type]) return base[type];
  const custom = customCongeTypes.find(t => t.id === type);
  return custom ? custom.color : '#8b8fa8';
}


// ── CONGÉS REPORTÉS D'UNE ANNÉE SUR L'AUTRE ──
// Calcule, pour un type de congé et une année données, le nombre de jours
// pris sur cette année précise (les quotas sont annuels : les congés pris
// une année N ne doivent pas amputer le solde de l'année N+1).
function getCongesTakenForYear(type, year) {
  return state.conges
    .filter(c => c.type === type && c.start.slice(0, 4) === String(year))
    .reduce((a, c) => a + (c.days || 0), 0);
}

function getCarryoverConfig() {
  try {
    const raw = localStorage.getItem('orvia_carryover_config');
    if (!raw) return { enabled: false, caps: { cp: 5, rtt: 2 } };
    const p = JSON.parse(raw);
    const caps = { cp: 5, rtt: 2 };
    if (p.caps && typeof p.caps === 'object') {
      ['cp', 'rtt'].forEach(t => {
        if (Number.isFinite(Number(p.caps[t]))) caps[t] = clampNumber(Number(p.caps[t]), 0, 365, caps[t]);
      });
    }
    return { enabled: p.enabled === true, caps };
  } catch (e) {
    return { enabled: false, caps: { cp: 5, rtt: 2 } };
  }
}

function saveCarryoverConfig(cfg) {
  localStorage.setItem('orvia_carryover_config', JSON.stringify(cfg));
}

// Jours reportés de l'année précédente vers l'année donnée, plafonnés par
// la config. Basé sur le solde non utilisé de l'année N-1 (quota - pris).
function getCarryoverForYear(type, year) {
  const cfg = getCarryoverConfig();
  if (!cfg.enabled) return 0;
  const cap = cfg.caps[type] || 0;
  if (cap <= 0) return 0;
  const prevYear = year - 1;
  const quota = Number(state.quotas[type] || 0);
  if (quota <= 0) return 0;
  const takenPrevYear = getCongesTakenForYear(type, prevYear);
  const leftoverPrevYear = Math.max(0, quota - takenPrevYear);
  return Math.min(cap, leftoverPrevYear);
}

function getEffectiveQuotaForYear(type, year) {
  const base = Number(state.quotas[type] || 0);
  return base + getCarryoverForYear(type, year);
}

// ── MODE BTP (CIBTP) : STATUT, ANCIENNETÉ, FRACTIONNEMENT ──
// Règles issues du régime des congés payés du secteur BTP (caisses CIBTP) :
// congé principal 12-24j pris entre mai et octobre, 5e semaine prise avant
// le 31 mars (ouvriers) ou le 30 avril (ETAM/cadres), jours d'ancienneté
// selon une grille configurable, et jours de fractionnement calculés selon
// le nombre de jours de CP pris hors de la période mai-octobre.
function getBTPConfig() {
  try {
    const raw = localStorage.getItem('orvia_btp_config');
    if (!raw) return { enabled: false, statut: 'ouvrier', embaucheDate: '', debutProfessionDate: '', ouvrables: true, anciennete: [], alertEnabled: true, alertWarningDays: 30 };
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled === true,
      statut: (p.statut === 'etam_cadre') ? 'etam_cadre' : 'ouvrier',
      embaucheDate: typeof p.embaucheDate === 'string' ? p.embaucheDate : '',
      debutProfessionDate: typeof p.debutProfessionDate === 'string' ? p.debutProfessionDate : '',
      ouvrables: p.ouvrables !== false,
      anciennete: Array.isArray(p.anciennete) ? p.anciennete.filter(x => Number.isFinite(Number(x.years)) && Number.isFinite(Number(x.days))) : [],
      alertEnabled: p.alertEnabled !== false,
      alertWarningDays: Number.isFinite(Number(p.alertWarningDays)) ? clampNumber(Number(p.alertWarningDays), 1, 180, 30) : 30
    };
  } catch (e) {
    return { enabled: false, statut: 'ouvrier', embaucheDate: '', debutProfessionDate: '', ouvrables: true, anciennete: [], alertEnabled: true, alertWarningDays: 30 };
  }
}

function saveBTPConfig(cfg) {
  localStorage.setItem('orvia_btp_config', JSON.stringify(cfg));
}

function getBTPAncienneteYears(cfg) {
  if (!cfg.embaucheDate) return 0;
  const start = new Date(cfg.embaucheDate + 'T00:00:00');
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  const anniv = new Date(start); anniv.setFullYear(now.getFullYear());
  if (now < anniv) years--;
  return Math.max(0, years);
}

// Période de prise en cours : du 1er mai de l'année Y au 30 avril de Y+1
// (l'acquisition correspondante s'est terminée le 31 mars Y).
function getBTPPriseYear(ref) {
  const d = ref || new Date();
  return d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

function btpAddYears(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + n);
  return d;
}

// ETAM / cadres (CIBTP) : le critère le plus favorable entre l'ancienneté dans
// l'entreprise (> 5 ans : 2 j, > 10 ans : 3 j) et dans la profession
// (> 10 ans : 2 j, 20 ans et plus : 3 j), appréciée au 31 mars.
function getBTPAncienneteInfo(cfg, priseYear) {
  cfg = cfg || getBTPConfig();
  const y = priseYear ?? getBTPPriseYear();
  const ref = new Date(`${y}-03-31T23:59:59`);
  if (cfg.statut !== 'etam_cadre') {
    return { mode: 'grille', days: getBTPAncienneteDaysGrid(cfg), ref };
  }
  const ent = cfg.embaucheDate ? btpAddYears(cfg.embaucheDate, 0) : null;
  const prof = cfg.debutProfessionDate || cfg.embaucheDate;
  const yearsBetween = (from) => {
    if (!from) return 0;
    const d = new Date(from + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return 0;
    let n = ref.getFullYear() - d.getFullYear();
    const anniv = new Date(d); anniv.setFullYear(ref.getFullYear());
    if (ref < anniv) n--;
    return Math.max(0, n);
  };
  const afterYears = (from, n, inclusive) => {
    const t = from ? btpAddYears(from, n) : null;
    return !!t && (inclusive ? t <= ref : t < ref);
  };
  let daysEnt = 0;
  if (afterYears(cfg.embaucheDate, 10, false)) daysEnt = 3;
  else if (afterYears(cfg.embaucheDate, 5, false)) daysEnt = 2;
  let daysProf = 0;
  if (afterYears(prof, 20, true)) daysProf = 3;
  else if (afterYears(prof, 10, false)) daysProf = 2;
  return {
    mode: 'etam', ref,
    yearsEnt: yearsBetween(cfg.embaucheDate), yearsProf: yearsBetween(prof),
    daysEnt, daysProf, days: Math.max(daysEnt, daysProf),
    basis: daysProf > daysEnt ? 'profession' : 'entreprise'
  };
}

function getBTPAncienneteDays(cfg) {
  cfg = cfg || getBTPConfig();
  return getBTPAncienneteInfo(cfg).days;
}

function getBTPAncienneteDaysGrid(cfg) {
  cfg = cfg || getBTPConfig();
  const years = getBTPAncienneteYears(cfg);
  const sorted = [...cfg.anciennete].sort((a, b) => Number(a.years) - Number(b.years));
  let days = 0;
  sorted.forEach(row => { if (years >= Number(row.years)) days = Number(row.days); });
  return days;
}

// Fractionnement (CIBTP) — sur la période de prise du 1er mai Y au 30 avril Y+1 :
//  - conditions : 12 jours ouvrables continus pris avant le 1er novembre, et au moins 15 jours acquis ;
//  - jours pris du 1er novembre au 30 avril sur les 24 premiers jours (hors 5e semaine) :
//    3 à 5 jours → 1 jour supplémentaire, 6 jours ou plus → 2 jours.
// Les jours de la 5e semaine (6 jours ouvrables) sont retirés des jours hors période : estimation.
function getBTPFractionnementInfo(priseYear) {
  const cfg = getBTPConfig();
  const y = priseYear ?? getBTPPriseYear();
  const inStart = `${y}-05-01`, inEnd = `${y}-10-31`;
  const outStart = `${y}-11-01`, outEnd = `${y + 1}-04-30`;
  let insidePeriod = 0, outsidePeriod = 0, continuous = false;
  state.conges.filter(c => c.type === 'cp').forEach(c => {
    const ouv = c.unit === 'ouv';
    const d = new Date(c.start + 'T00:00:00');
    const e = new Date(c.end + 'T00:00:00');
    let blockSpan = 0; // jours de la période, fériés compris : ils n'interrompent pas les 12 jours
    while (d <= e) {
      const dow = d.getDay();
      const iso = toLocalISO(d);
      const worked = dow !== 0 && (ouv || dow !== 6);
      if (worked) {
        const inside = iso >= inStart && iso <= inEnd;
        if (inside) blockSpan++;
        if (!isDateHoliday(iso)) {
          if (inside) insidePeriod++;
          else if (iso >= outStart && iso <= outEnd) outsidePeriod++;
        }
      }
      d.setDate(d.getDate() + 1);
    }
    if (blockSpan >= (ouv ? 12 : 10)) continuous = true;
  });
  const fifthWeek = cfg.ouvrables ? 6 : 5;
  const relevantOutside = Math.max(0, outsidePeriod - fifthWeek);
  const enoughAcquired = Number(state.quotas.cp || 0) >= 15;
  let bonusDays = 0;
  if (continuous && enoughAcquired) {
    if (relevantOutside >= 6) bonusDays = 2;
    else if (relevantOutside >= 3) bonusDays = 1;
  }
  return { insidePeriod, outsidePeriod, relevantOutside, continuous, enoughAcquired, bonusDays, priseYear: y };
}

function getBTPDeadlines(cfg) {
  cfg = cfg || getBTPConfig();
  const now = new Date();
  const year = now.getFullYear();
  const cinquiemeDeadline = cfg.statut === 'ouvrier' ? `${year}-03-31` : `${year}-04-30`;
  return {
    congePrincipalEnd: `${year}-10-31`,
    cinquiemeSemaineEnd: cinquiemeDeadline,
    fractionnementEnd: `${year}-04-30`
  };
}

// ── ALERTE 5E SEMAINE À RISQUE (BTP) ──
// Vérifie si le solde de CP restant sur la période d'acquisition en cours
// (1er avril - 31 mars) risque d'être perdu avant l'échéance légale de la
// 5e semaine (31 mars pour les ouvriers, 30 avril pour les ETAM/cadres).
function getBTPAcquisitionYearStart(refDate) {
  const d = refDate || new Date();
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return year;
}

function getBTP5eSemaineRisk() {
  const cfg = getBTPConfig();
  if (!cfg.enabled || !cfg.alertEnabled) return null;
  const deadlines = getBTPDeadlines(cfg);
  const deadlineDate = new Date(deadlines.cinquiemeSemaineEnd + 'T23:59:59');
  const now = new Date();
  let effectiveDeadline = deadlineDate;
  if (effectiveDeadline.getTime() < now.getTime()) {
    effectiveDeadline = new Date(effectiveDeadline.getFullYear() + 1, effectiveDeadline.getMonth(), effectiveDeadline.getDate(), 23, 59, 59);
  }
  const daysLeft = Math.ceil((effectiveDeadline.getTime() - now.getTime()) / 86400000);
  if (daysLeft < 0 || daysLeft > cfg.alertWarningDays) return null;

  // Les congés se prennent du 1er mai Y au 30 avril Y+1 (acquisition terminée le 31 mars Y).
  const priseYear = getBTPPriseYear(new Date(effectiveDeadline.getFullYear(), effectiveDeadline.getMonth() - 4, 1));
  const periodStart = `${priseYear}-05-01`;
  const periodEnd = `${priseYear + 1}-04-30`;
  const cpTaken = state.conges
    .filter(c => c.type === 'cp' && c.start >= periodStart && c.start <= periodEnd)
    .reduce((a, c) => a + (c.days || 0), 0);
  const quota = Number(state.quotas.cp || 0);
  const left = Math.max(0, quota - cpTaken);
  if (left <= 0) return null;

  return { left, deadline: effectiveDeadline, daysLeft, statut: cfg.statut };
}

function renderBTP5eSemaineBanner() {
  const el = document.getElementById('btpFifthWeekBanner');
  if (!el) return;
  const risk = getBTP5eSemaineRisk();
  if (!risk) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const deadlineStr = risk.deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:rgba(239,68,68,.12);border:1px solid var(--accent2);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--accent2);font-size:13px;margin-bottom:4px;">🏗️⏳ 5e semaine à risque</div>
      <div style="font-size:12px;color:var(--muted);">${risk.left} jour${risk.left > 1 ? 's' : ''} de CP à utiliser avant le ${deadlineStr} (dans ${risk.daysLeft} jour${risk.daysLeft > 1 ? 's' : ''}), sous peine de perte selon la règle CIBTP.</div>
    </div>`;
}

// Notification push proactive, une fois par jour, si la 5e semaine est à risque.
function checkBTP5eSemaineNotification() {
  const risk = getBTP5eSemaineRisk();
  if (!risk) return;
  const today = todayKey();
  const lastNotifKey = 'orvia_btp_fifthweek_last_notif';
  if (localStorage.getItem(lastNotifKey) === today) return;
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  if (canNotify) {
    orviaNotify('5e semaine à risque 🏗️⏳', { body: `${risk.left}j de congé payé à prendre avant le ${risk.deadline.toLocaleDateString('fr-FR')} (règle CIBTP).` });
  }
  localStorage.setItem(lastNotifKey, today);
}

function addAncienneteRow(years, days) {
  const cfg = getBTPConfig();
  cfg.anciennete.push({ years: years ?? 5, days: days ?? 1 });
  saveBTPConfig(cfg);
  renderBTPSettings();
}

function removeAncienneteRow(index) {
  const cfg = getBTPConfig();
  cfg.anciennete.splice(index, 1);
  saveBTPConfig(cfg);
  renderBTPSettings();
}

function updateAncienneteRow(index, field, value) {
  const cfg = getBTPConfig();
  if (!cfg.anciennete[index]) return;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return;
  cfg.anciennete[index][field] = n;
  saveBTPConfig(cfg);
}

function onBTPSettingsChange() {
  const cfg = getBTPConfig();
  const enabledEl = document.getElementById('btpEnabled');
  const statutEl = document.getElementById('btpStatut');
  const dateEl = document.getElementById('btpEmbaucheDate');
  cfg.enabled = enabledEl ? enabledEl.checked : false;
  cfg.statut = statutEl ? statutEl.value : 'ouvrier';
  cfg.embaucheDate = dateEl ? dateEl.value : '';
  const profEl = document.getElementById('btpProfessionDate');
  const ouvEl = document.getElementById('btpOuvrables');
  cfg.debutProfessionDate = profEl ? profEl.value : '';
  cfg.ouvrables = ouvEl ? ouvEl.checked : true;
  saveBTPConfig(cfg);
  renderConges();
  showToast(cfg.enabled ? 'Mode BTP activé' : 'Mode BTP désactivé');
}

function onBTPAlertSettingsChange() {
  const cfg = getBTPConfig();
  const alertEnabledEl = document.getElementById('btpAlertEnabled');
  const alertWarningEl = document.getElementById('btpAlertWarningDays');
  cfg.alertEnabled = alertEnabledEl ? alertEnabledEl.checked : true;
  cfg.alertWarningDays = alertWarningEl ? Number(alertWarningEl.value) : 30;
  saveBTPConfig(cfg);
  if (cfg.alertEnabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  renderBTPAlertPreview();
  renderConges();
  showToast(cfg.alertEnabled ? 'Alerte 5e semaine activée' : 'Alerte 5e semaine désactivée');
}

function renderBTPAlertPreview() {
  const el = document.getElementById('btpAlertPreview');
  if (!el) return;
  const cfg = getBTPConfig();
  const deadlines = getBTPDeadlines(cfg);
  const deadlineStr = new Date(deadlines.cinquiemeSemaineEnd + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  el.textContent = `Prochaine échéance de la 5e semaine : ${deadlineStr}. Tu seras averti ${cfg.alertWarningDays} jours avant si un solde de CP reste à prendre.`;
}

function renderBTPSettings() {
  const cfg = getBTPConfig();
  const enabledEl = document.getElementById('btpEnabled');
  const statutEl = document.getElementById('btpStatut');
  const dateEl = document.getElementById('btpEmbaucheDate');
  const alertEnabledEl = document.getElementById('btpAlertEnabled');
  const alertWarningEl = document.getElementById('btpAlertWarningDays');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (statutEl) statutEl.value = cfg.statut;
  if (dateEl) dateEl.value = cfg.embaucheDate;
  const profEl = document.getElementById('btpProfessionDate');
  const ouvEl = document.getElementById('btpOuvrables');
  if (profEl) profEl.value = cfg.debutProfessionDate;
  if (ouvEl) ouvEl.checked = cfg.ouvrables;
  const profBox = document.getElementById('btpProfessionBox');
  if (profBox) profBox.style.display = cfg.statut === 'etam_cadre' ? 'block' : 'none';
  const gridBox = document.getElementById('btpGridBox');
  if (gridBox) gridBox.style.display = cfg.statut === 'etam_cadre' ? 'none' : 'block';
  if (alertEnabledEl) alertEnabledEl.checked = cfg.alertEnabled;
  if (alertWarningEl) alertWarningEl.value = String(cfg.alertWarningDays);
  renderBTPAlertPreview();
  const grid = document.getElementById('btpAncienneteGrid');
  if (!grid) return;
  if (!cfg.anciennete.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--muted);">Aucun palier défini.</div>';
    return;
  }
  const sorted = cfg.anciennete.map((row, i) => ({ ...row, i })).sort((a, b) => Number(a.years) - Number(b.years));
  grid.innerHTML = sorted.map(row => `
    <div style="display:flex;align-items:center;gap:8px;">
      <input type="number" min="0" max="60" value="${row.years}" onchange="updateAncienneteRow(${row.i},'years',this.value)" style="width:70px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text);">
      <span style="font-size:12px;color:var(--muted);">ans →</span>
      <input type="number" min="0" max="30" value="${row.days}" onchange="updateAncienneteRow(${row.i},'days',this.value)" style="width:70px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text);">
      <span style="font-size:12px;color:var(--muted);">jours</span>
      <button onclick="removeAncienneteRow(${row.i})" style="margin-left:auto;background:transparent;color:var(--accent2);border:1px solid var(--accent2);padding:4px 10px;border-radius:8px;font-size:11px;cursor:pointer;">✕</button>
    </div>`).join('');
}

function toggleBTPExplainer() {
  const box = document.getElementById('btpExplainerBox');
  if (!box) return;
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function openBTPSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-btp-settings').classList.add('active');
  renderBTPSettings();
}

function renderBTPSummaryCard() {
  const el = document.getElementById('btpSummaryCard');
  if (!el) return;
  const cfg = getBTPConfig();
  if (!cfg.enabled) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const year = getBTPPriseYear();
  const anc = getBTPAncienneteInfo(cfg, year);
  const anciennete = anc.days;
  const frac = getBTPFractionnementInfo(year);
  const deadlines = getBTPDeadlines(cfg);
  const years = getBTPAncienneteYears(cfg);
  const ancLine = anc.mode === 'etam'
    ? `Ancienneté au 31 mars : <b style="color:var(--text);">${anc.yearsEnt} an${anc.yearsEnt > 1 ? 's' : ''}</b> entreprise, <b style="color:var(--text);">${anc.yearsProf} an${anc.yearsProf > 1 ? 's' : ''}</b> profession → <b style="color:var(--text);">${anciennete} jour${anciennete > 1 ? 's' : ''}</b> supplémentaire${anciennete > 1 ? 's' : ''}${anciennete ? ` (critère ${anc.basis})` : ''}<br>`
    : `Ancienneté : <b style="color:var(--text);">${years} an${years > 1 ? 's' : ''}</b> → <b style="color:var(--text);">${anciennete} jour${anciennete > 1 ? 's' : ''}</b> supplémentaire${anciennete > 1 ? 's' : ''}<br>`;
  const fracNote = !frac.continuous ? ' — il manque 12 jours continus pris avant le 1er novembre' : (!frac.enoughAcquired ? ' — moins de 15 jours acquis' : '');
  el.style.display = 'block';
  el.innerHTML = `
    <div class="settings-card" style="margin-bottom:16px;padding:14px;">
      <div style="font-weight:800;color:var(--accent);margin-bottom:8px;">🏗️ Droits BTP (prise du 1er mai ${year} au 30 avril ${year + 1})</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.7;">
        ${ancLine}
        Jours de fractionnement acquis : <b style="color:var(--text);">${frac.bonusDays}</b> (${frac.relevantOutside}j de CP pris du 1er novembre au 30 avril, hors 5e semaine)${fracNote}<br>
        5e semaine à prendre avant le <b style="color:var(--text);">${new Date(deadlines.cinquiemeSemaineEnd + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}</b>
      </div>
    </div>`;
}



// ── CALENDRIER SCOLAIRE (ZONES A / B / C) ──
// Dates officielles des vacances scolaires françaises par zone, pour
// anticiper les congés familiaux (Éducation nationale, arrêtés officiels).
const SCHOOL_HOLIDAYS = {
  // ── Année scolaire 2025-2026 ──
  A: [
    { label: 'Toussaint', start: '2025-10-18', end: '2025-11-03' },
    { label: 'Noël', start: '2025-12-20', end: '2026-01-05' },
    { label: 'Hiver', start: '2026-02-07', end: '2026-02-23' },
    { label: 'Printemps', start: '2026-04-04', end: '2026-04-20' },
    { label: 'Été', start: '2026-07-04', end: '2026-09-01' },
    { label: 'Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { label: 'Noël', start: '2026-12-19', end: '2027-01-04' },
    { label: 'Hiver', start: '2027-02-13', end: '2027-03-01' },
    { label: 'Printemps', start: '2027-04-10', end: '2027-04-26' },
    { label: 'Été', start: '2027-07-03', end: '2027-09-01' }
  ],
  B: [
    { label: 'Toussaint', start: '2025-10-18', end: '2025-11-03' },
    { label: 'Noël', start: '2025-12-20', end: '2026-01-05' },
    { label: 'Hiver', start: '2026-02-14', end: '2026-03-02' },
    { label: 'Printemps', start: '2026-04-11', end: '2026-04-27' },
    { label: 'Été', start: '2026-07-04', end: '2026-09-01' },
    { label: 'Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { label: 'Noël', start: '2026-12-19', end: '2027-01-04' },
    { label: 'Hiver', start: '2027-02-20', end: '2027-03-08' },
    { label: 'Printemps', start: '2027-04-17', end: '2027-05-03' },
    { label: 'Été', start: '2027-07-03', end: '2027-09-01' }
  ],
  C: [
    { label: 'Toussaint', start: '2025-10-18', end: '2025-11-03' },
    { label: 'Noël', start: '2025-12-20', end: '2026-01-05' },
    { label: 'Hiver', start: '2026-02-21', end: '2026-03-09' },
    { label: 'Printemps', start: '2026-04-18', end: '2026-05-04' },
    { label: 'Été', start: '2026-07-04', end: '2026-09-01' },
    { label: 'Toussaint', start: '2026-10-17', end: '2026-11-02' },
    { label: 'Noël', start: '2026-12-19', end: '2027-01-04' },
    { label: 'Hiver', start: '2027-02-06', end: '2027-02-22' },
    { label: 'Printemps', start: '2027-04-03', end: '2027-04-19' },
    { label: 'Été', start: '2027-07-03', end: '2027-09-01' }
  ]
};
const SCHOOL_ZONE_ACADEMIES = {
  A: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers',
  B: 'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg',
  C: 'Créteil, Montpellier, Paris, Toulouse, Versailles'
};

function getSchoolZoneConfig() {
  try {
    const raw = localStorage.getItem('orvia_school_zone');
    if (!raw) return { zone: null };
    const p = JSON.parse(raw);
    return { zone: ['A', 'B', 'C'].includes(p.zone) ? p.zone : null };
  } catch (e) {
    return { zone: null };
  }
}

function saveSchoolZoneConfig(cfg) {
  localStorage.setItem('orvia_school_zone', JSON.stringify(cfg));
}

function isDateInSchoolHoliday(dateStr) {
  const cfg = getSchoolZoneConfig();
  if (!cfg.zone) return null;
  const periods = SCHOOL_HOLIDAYS[cfg.zone] || [];
  return periods.find(p => dateStr >= p.start && dateStr <= p.end) || null;
}

function getUpcomingSchoolHolidays(count) {
  const cfg = getSchoolZoneConfig();
  if (!cfg.zone) return [];
  const today = todayKey();
  const periods = SCHOOL_HOLIDAYS[cfg.zone] || [];
  return periods.filter(p => p.end >= today).slice(0, count || 5);
}

function openSchoolCalendarSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-schoolcal-settings').classList.add('active');
  renderSchoolCalendarSettingsForm();
}

function renderSchoolCalendarSettingsForm() {
  const cfg = getSchoolZoneConfig();
  ['A', 'B', 'C', 'none'].forEach(z => {
    const el = document.getElementById('schoolZoneOpt_' + z);
    if (el) el.checked = (cfg.zone === z) || (z === 'none' && !cfg.zone);
  });
  renderSchoolCalendarUpcoming();
}

function onSchoolZoneChange() {
  let selected = null;
  ['A', 'B', 'C'].forEach(z => {
    const el = document.getElementById('schoolZoneOpt_' + z);
    if (el && el.checked) selected = z;
  });
  saveSchoolZoneConfig({ zone: selected });
  renderSchoolCalendarUpcoming();
  showToast(selected ? `Zone ${selected} sélectionnée ✓` : 'Calendrier scolaire désactivé');
}

function renderSchoolCalendarUpcoming() {
  const el = document.getElementById('schoolCalendarUpcoming');
  if (!el) return;
  const cfg = getSchoolZoneConfig();
  if (!cfg.zone) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Sélectionne ta zone académique pour voir les prochaines périodes de vacances scolaires.</div></div>';
    return;
  }
  const upcoming = getUpcomingSchoolHolidays(6);
  if (!upcoming.length) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Aucune période à venir dans les données disponibles.</div></div>';
    return;
  }
  el.innerHTML = upcoming.map(p => {
    const startD = new Date(p.start + 'T00:00:00');
    const endD = new Date(p.end + 'T00:00:00');
    const startStr = startD.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    const endStr = endD.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `<div class="settings-card" style="margin-bottom:8px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-weight:700;font-size:13px;color:var(--text);">🏫 ${p.label}</span>
      <span style="font-size:12px;color:var(--muted);">${startStr} → ${endStr}</span>
    </div>`;
  }).join('');
}

function openCarryoverSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-carryover-settings').classList.add('active');
  renderCarryoverSettingsForm();
}

function renderCarryoverSettingsForm() {
  const cfg = getCarryoverConfig();
  const enabledEl = document.getElementById('carryoverEnabled');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  ['cp', 'rtt'].forEach(t => {
    const el = document.getElementById('carryoverCap_' + t);
    if (el) el.value = cfg.caps[t];
  });
  renderCarryoverPreview();
}

function renderCarryoverPreview() {
  const el = document.getElementById('carryoverPreview');
  if (!el) return;
  const cfg = getCarryoverConfig();
  const thisYear = new Date().getFullYear();
  if (!cfg.enabled) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);">Le report est désactivé : les quotas repartent à zéro chaque année.</div>';
    return;
  }
  const rows = ['cp', 'rtt']
    .filter(t => cfg.caps[t] > 0)
    .map(t => {
      const carried = getCarryoverForYear(t, thisYear);
      return `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);margin-bottom:4px;"><span>${getCongeTypeLabel(t)}</span><span style="font-weight:700;color:var(--accent);">+${carried}j reportés en ${thisYear}</span></div>`;
    }).join('');
  el.innerHTML = rows || '<div style="font-size:12px;color:var(--muted);">Aucun plafond de report configuré.</div>';
}

function onCarryoverSettingsChange() {
  const enabledEl = document.getElementById('carryoverEnabled');
  const caps = {};
  ['cp', 'rtt'].forEach(t => {
    const el = document.getElementById('carryoverCap_' + t);
    caps[t] = el ? clampNumber(Number(el.value), 0, 365, 0) : 0;
  });
  const cfg = { enabled: enabledEl ? enabledEl.checked : false, caps };
  saveCarryoverConfig(cfg);
  renderCarryoverPreview();
  renderConges();
  showToast('Réglages mis à jour ✓');
}

function renderConges() {
  const types = ['cp','rtt'];
  const colors = { cp:'#6c63ff', rtt:'#3ecf8e' };
  const thisYear = new Date().getFullYear();

  renderBTPSummaryCard();
  renderBTP5eSemaineBanner();
  checkBTP5eSemaineNotification();

  // Solde cards
  document.getElementById('soldeGrid').innerHTML = types.map(t => {
    const carryover = getCarryoverForYear(t, thisYear);
    const quota = Number(state.quotas[t] || 0) + carryover;
    const taken = getCongesTakenForYear(t, thisYear);
    const left = Math.max(0, quota - taken);
    const pct = quota > 0 ? Math.min(100, (taken / quota) * 100) : 0;
    const isLow = (t === 'cp' || t === 'rtt') && quota > 0 && left > 0 && left < LOW_QUOTA_THRESHOLD;
    const lowBadge = isLow ? `<span style="font-size:11px;color:var(--orange);font-weight:700;margin-left:6px;">⚠️ bas</span>` : '';
    const carryBadge = carryover > 0 ? `<span style="font-size:10px;color:var(--accent);font-weight:700;margin-left:6px;">+${carryover}j reportés</span>` : '';
    return `<div class="solde-card" style="background:${colors[t]}18${isLow ? ';border:1px solid var(--orange)' : ''}">
      <div class="sc-type" style="color:${colors[t]}">${CONGE_LABELS[t]}${lowBadge}${carryBadge}</div>
      <div class="sc-nums">
        <span class="sc-taken" style="color:${colors[t]}">${left}</span>
        <span class="sc-total">/ ${quota} j restants</span>
      </div>
      <div class="sc-bar"><div class="sc-fill" style="width:${pct}%;background:${colors[t]}"></div></div>
    </div>`;
  }).join('');

  // Calendrier
  renderCal();

  checkLowQuotaAlerts();
  renderCongeExpiryBanner();
  checkCongeExpiryNotification();

  // Liste
  const list = document.getElementById('congeList');
  const empty = document.getElementById('emptyConges');
  const sorted = [...state.conges].sort((a,b) => b.start.localeCompare(a.start));
  if (!sorted.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = sorted.map(c => `
    <div class="conge-list-item">
      <div>
        <div class="cl-type" style="color:${getCongeTypeColor(c.type)}">${escapeHtml(getCongeTypeLabel(c.type))}</div>
        <div class="cl-dates">${c.start === c.end ? c.start : c.start + ' → ' + c.end}${c.note ? ' — ' + escapeHtml(c.note) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="cl-days" style="color:${getCongeTypeColor(c.type)}">${c.days}j</span>
        <button class="conge-delete" onclick="deleteConge(${c.id})">✕</button>
      </div>
    </div>`).join('');
}

function findCongeForDate(dateStr) {
  return state.conges.find(c => c.start <= dateStr && dateStr <= c.end);
}

function renderCalLegend() {
  const el = document.getElementById('calLegend');
  if (!el) return;
  const base = [
    {label:'CP', color:'#6c63ff'},
    {label:'RTT', color:'#3ecf8e'}
  ];
  const custom = customCongeTypes.map(t => ({label: t.label, color: t.color}));
  const items = [...base, ...custom].map(x =>
    `<div class="legend-item"><div class="legend-dot" style="background:${x.color}66"></div>${escapeHtml(x.label)}</div>`
  ).join('');
  el.innerHTML = items +
    '<div class="legend-item"><div class="legend-dot" style="background:rgba(62,207,142,.1);border:1px solid var(--border)"></div>Travaillé</div>' +
    '<div class="legend-item"><div class="legend-dot" style="background:rgba(255,255,255,.06);border:1px dashed var(--muted)"></div>Jour férié</div>';
}

function toggleCongeListCollapse() {
  const wrap = document.getElementById('congeListWrap');
  const icon = document.getElementById('congeListToggleIcon');
  if (!wrap) return;
  const isHidden = wrap.style.display === 'none';
  wrap.style.display = isHidden ? 'block' : 'none';
  if (icon) icon.textContent = isHidden ? '▴ Masquer la liste' : '▾ Afficher la liste';
}

function renderCal() {
  const now = new Date();
  if (calYear === undefined) { calYear = now.getFullYear(); calMonth = now.getMonth(); }
  document.getElementById('calMonth').textContent =
    new Date(calYear, calMonth, 1).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
  renderCalLegend();

  const dateSets = { cp: new Set(), rtt: new Set() };     customCongeTypes.forEach(t => { dateSets[t.id] = new Set(); });
  state.conges.forEach(c => {
    let cur = new Date(c.start + 'T00:00:00');
    const end = new Date(c.end + 'T00:00:00');
    while (cur <= end) {
      if (dateSets[c.type]) dateSets[c.type].add(toLocalISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });
  const workedDays = new Set(state.sessions.map(s => toLocalISO(new Date(s.start))));

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7;

  const grid = document.getElementById('calGrid');
  const todayStr = toLocalISO(now);
  const dows = ['L','M','M','J','V','S','D'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  for (let i = 1; i < startDow; i++) html += `<div></div>`;

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dowIdx = new Date(calYear, calMonth, d).getDay();
    const isWeekend = dowIdx === 0 || dowIdx === 6;
    const isHoliday = isDateHoliday(dateStr);
    let cls = 'cal-day';
    if (isWeekend) cls += ' weekend';
    if (isHoliday) cls += ' holiday';
    if (dateStr === todayStr) cls += ' today';
    let hasConge = false;
    if (dateSets.cp.has(dateStr))  { cls += ' cp'; hasConge = true; }
    else if (dateSets.rtt.has(dateStr)) { cls += ' rtt'; hasConge = true; }
    let customColor = null;
    if (!hasConge) { for (const ct of customCongeTypes) { if (dateSets[ct.id] && dateSets[ct.id].has(dateStr)) { cls += ' has-conge'; customColor = ct.color; hasConge = true; break; } } }
    if (!hasConge && workedDays.has(dateStr)) cls += ' work';
    if (hasConge) cls += ' has-conge';
    const holidayLabel = isHoliday ? getHolidayLabel(dateStr) : null;
    const schoolHoliday = isDateInSchoolHoliday(dateStr);
    const titleAttr = (holidayLabel || schoolHoliday) ? ` title="${holidayLabel || ''}${holidayLabel && schoolHoliday ? ' — ' : ''}${schoolHoliday ? 'Vacances scolaires: ' + schoolHoliday.label : ''}"` : '';
    const clickAttr = hasConge ? ` onclick="openCalDayDetail('${dateStr}')"` : ` onclick="openAddCongeForDate('${dateStr}')"` ;
    const schoolDot = schoolHoliday ? '<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#f59e0b;"></span>' : '';
    html += `<div class="${cls}" style="position:relative;${customColor ? 'background:'+customColor+'33;color:'+customColor+';' : ''}"${clickAttr}${titleAttr}>${d}${schoolDot}</div>`;
  }
  grid.innerHTML = html;
}

function openCalDayDetail(dateStr) {
  const conge = findCongeForDate(dateStr);
  if (!conge) return;
  const d = new Date(dateStr + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const box = document.getElementById('calDayDetailBox');
  box.innerHTML = `
    <div class="modal-title">${dateLabel}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <div style="width:12px;height:12px;border-radius:3px;background:${getCongeTypeColor(conge.type)}"></div>
      <span style="font-weight:700;color:${getCongeTypeColor(conge.type)}">${escapeHtml(getCongeTypeLabel(conge.type))}</span>
    </div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:16px;">
      ${conge.start === conge.end ? conge.start : conge.start + ' → ' + conge.end} (${conge.days}j)${conge.note ? '<br>' + escapeHtml(conge.note) : ''}
    </div>
    <div class="modal-actions">
      <button class="modal-btn-cancel" onclick="closeCalDayDetail()">Fermer</button>
      <button class="modal-btn-save" style="background:#ef4444;" onclick="deleteCongeFromCal(${conge.id})">Supprimer</button>
    </div>
  `;
  document.getElementById('calDayDetailModal').style.display = 'flex';
}

function openAddCongeForDate(dateStr){
  window._quickAddCongeDate = dateStr;
  const typeSel = document.getElementById('quickAddCongeType');
  if (typeSel) {
    const emojis = {cp:'🟣', rtt:'🟢'};
    let opts = ['cp','rtt'].map(t => `<option value="${t}">${emojis[t]||''} ${escapeHtml(CONGE_LABELS[t])}</option>`).join('');
    customCongeTypes.forEach(t => { opts += `<option value="${t.id}">${escapeHtml(t.label)}</option>`; });
    typeSel.innerHTML = opts;
  }
  const noteEl = document.getElementById('quickAddCongeNote');
  if (noteEl) noteEl.value = '';
  const errEl = document.getElementById('quickAddCongeError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  const labelEl = document.getElementById('quickAddCongeDateLabel');
  if (labelEl) {
    const d = new Date(dateStr + 'T00:00:00');
    labelEl.textContent = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  const modal = document.getElementById('quickAddCongeModal');
  if (modal) modal.style.display = 'flex';
}

function closeQuickAddCongeModal() {
  const modal = document.getElementById('quickAddCongeModal');
  if (modal) modal.style.display = 'none';
  window._quickAddCongeDate = null;
}

function submitQuickAddConge() {
  const dateStr = window._quickAddCongeDate;
  const errEl = document.getElementById('quickAddCongeError');
  if (!dateStr) { closeQuickAddCongeModal(); return; }
  const typeSel = document.getElementById('quickAddCongeType');
  const noteEl = document.getElementById('quickAddCongeNote');
  const type = typeSel ? typeSel.value : 'cp';
  const note = noteEl ? noteEl.value.trim() : '';
  const isCustomType = customCongeTypes.some(t => t.id === type);
  const unit = congeUnitFor(type);
  const days = computeCongeDays(dateStr, dateStr, unit);
  if (!isCustomType) {
    const congeYear = Number(dateStr.slice(0, 4));
    const taken = getCongesTakenForYear(type, congeYear);
    const quota = getEffectiveQuotaForYear(type, congeYear);
    if (taken + days > quota) {
      if (errEl) { errEl.textContent = `Quota dépassé pour ${type.toUpperCase()} (${taken}/${quota} jours utilisés, report inclus)`; errEl.style.display = 'block'; }
      return;
    }
  }
  const overlap = findCongeForDate(dateStr);
  if (overlap) {
    if (errEl) { errEl.textContent = `Le ${dateStr} est déjà pris (${getCongeTypeLabel(overlap.type)})`; errEl.style.display = 'block'; }
    return;
  }
  state.conges.push({ type, start: dateStr, end: dateStr, note, days, ...(unit ? { unit } : {}), id: Date.now() + Math.floor(Math.random()*100000) });
  saveConges();
  logAuditEntry('conge', 'création', `${days} jour(s) de ${getCongeTypeLabel(type)} le ${dateStr}`);
  closeQuickAddCongeModal();
  renderConges();
  showToast(`${days} jour(s) enregistré(s) ✓`);
}

function openFullCongeFormFromQuickAdd() {
  const dateStr = window._quickAddCongeDate;
  closeQuickAddCongeModal();
  const s = document.getElementById('congeStart'); const e = document.getElementById('congeEnd');
  if (s) s.value = dateStr; if (e) e.value = dateStr;
  switchTab('conges');
  const addCard = document.querySelector('#page-conges .add-conge-card');
  window.scrollTo({top:(addCard?.offsetTop||0),behavior:'smooth'});
}function closeCalDayDetail() {
  document.getElementById('calDayDetailModal').style.display = 'none';
}

function deleteCongeFromCal(id) {
  closeCalDayDetail();
  deleteConge(id);
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCal();
}
function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCal();
}



// Convertit les congés payés déjà saisis (comptés en jours ouvrés) en jours ouvrables.
function convertCpToOuvrables() {
  const todo = state.conges.filter(c => c.type === 'cp' && c.unit !== 'ouv');
  if (!todo.length) { showToast('Rien à convertir'); return; }
  if (!confirm(`Convertir ${todo.length} congé(s) payé(s) en jours ouvrables (lundi–samedi) ?\n\nLes durées seront recalculées : une semaine complète posée du lundi au vendredi inclura le samedi et passera de 5 à 6 jours. Pense à passer ton quota de CP à 30.`)) return;
  let extended = 0;
  todo.forEach(c => {
    // Une semaine complète posée du lundi au vendredi se compte 6 jours ouvrables : on inclut le samedi.
    const endD = new Date(c.end + 'T00:00:00');
    if (endD.getDay() === 5 && workdaysBetween(c.start, c.end) >= 5) {
      const sat = new Date(endD); sat.setDate(sat.getDate() + 1);
      const satIso = toLocalISO(sat);
      const taken = state.conges.some(o => o !== c && o.start <= satIso && o.end >= satIso);
      if (!isDateHoliday(satIso) && !taken) { c.end = satIso; extended++; }
    }
    c.unit = 'ouv';
    c.days = ouvrablesBetween(c.start, c.end);
  });
  saveConges();
  logAuditEntry('conge', 'modification', `Conversion de ${todo.length} congé(s) payé(s) en jours ouvrables`);
  renderConges();
  renderBTPSettings();
  showToast(`${todo.length} congé(s) converti(s)${extended ? `, ${extended} étendu(s) au samedi` : ''} ✓`);
}
