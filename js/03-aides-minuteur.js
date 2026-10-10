// ── DÉTECTION D'INACTIVITÉ (session oubliée) ──
let inactivite = { enabled: true, seuilHeures: 12 };

function saveInactivite() {
  localStorage.setItem('orvia_inactivite', JSON.stringify(inactivite));
}

function loadInactivite() {
  try {
    const a = localStorage.getItem('orvia_inactivite');
    if (a) {
      const parsed = JSON.parse(a);
      inactivite = Object.assign({ enabled: true, seuilHeures: 12 }, parsed);
    }
  } catch(e) {}
}

// ── RÉSUMÉ DE LA VEILLE (première ouverture uniquement) ──
let resumeJour = { enabled: true };

function saveResumeJour() {
  localStorage.setItem('orvia_resume_jour', JSON.stringify(resumeJour));
}

function loadResumeJour() {
  try {
    const a = localStorage.getItem('orvia_resume_jour');
    if (a) {
      const parsed = JSON.parse(a);
      resumeJour = Object.assign({ enabled: true }, parsed);
    }
  } catch(e) {}
}

function hasYesterdaySummaryBeenShown() {
  return localStorage.getItem('orvia_resume_veille_shown') === '1';
}

function markYesterdaySummaryShown() {
  localStorage.setItem('orvia_resume_veille_shown', '1');
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return tsToKey(d.getTime());
}

function computeYesterdaySummaryData() {
  const yesterday = getYesterdayKey();
  const yesterdaySessions = state.sessions.filter(s => s.date === yesterday);
  const dayTotal = yesterdaySessions.reduce((a, s) => a + s.net, 0);

  const dowYesterday = new Date(Date.now() - 86400000).getDay();
  const jourGoal = (objectifs.parJour && typeof objectifs.parJour[dowYesterday] !== 'undefined') ? objectifs.parJour[dowYesterday] : objectifs.jour;

  let gainsInfo = null;
  if (remuneration.enabled && remuneration.tauxHoraire) {
    const yesterdayStart = new Date(Date.now() - 86400000); yesterdayStart.setHours(0, 0, 0, 0);
    const monday = getMondayOf(yesterdayStart);
    const weekBeforeMs = state.sessions
      .filter(s => s.start >= monday.getTime() && s.start < yesterdayStart.getTime())
      .reduce((a, s) => a + (s.net || 0), 0);
    const gainsDayBrut = calcGainsJour(dayTotal, weekBeforeMs, yesterday);
    gainsInfo = { day: gainsDayBrut };
  }

  return { dayTotal, jourGoal, gainsInfo, hadSessionYesterday: yesterdaySessions.length > 0 };
}

function renderYesterdaySummaryModal() {
  const data = computeYesterdaySummaryData();
  const contentEl = document.getElementById('dailySummaryContent');
  if (!contentEl) return;

  const dayPct = data.jourGoal > 0 ? Math.min(100, Math.round((data.dayTotal / data.jourGoal) * 100)) : 0;

  const gainsHtml = data.gainsInfo ? `
    <div style="font-size:12px;color:var(--muted);margin-top:10px;">
      Gains estimés hier : <strong style="color:var(--accent)">${fmtEuros(data.gainsInfo.day)}</strong>
    </div>
  ` : '';

  const messageHtml = !data.hadSessionYesterday ? `
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">Aucune session enregistrée hier.</div>
  ` : '';

  contentEl.innerHTML = `
    ${messageHtml}
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Hier</span>
        <span class="objectif-values" style="color:${dayPct>=100?'var(--green)':dayPct>=75?'var(--orange)':'var(--accent)'}">${fmtHM(data.dayTotal)} / ${fmtHM(data.jourGoal)}</span>
      </div>
      <div class="objectif-bar-bg"><div class="objectif-bar-fill ${dayPct>=100?'done':dayPct>=75?'warning':'progress'}" style="width:${dayPct}%"></div></div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;">${dayPct>=100 ? 'Objectif du jour atteint 🎉' : (data.hadSessionYesterday ? 'Objectif non atteint' : '')}</div>
    </div>
    ${gainsHtml}
  `;
}

function openYesterdaySummaryModal() {
  const modal = document.getElementById('dailySummaryModal');
  if (!modal) return;
  renderYesterdaySummaryModal();
  modal.style.display = 'flex';
}

function closeDailySummaryModal() {
  const modal = document.getElementById('dailySummaryModal');
  if (modal) modal.style.display = 'none';
}

function maybeShowYesterdaySummary() {
  if (!resumeJour.enabled) return;
  if (hasYesterdaySummaryBeenShown()) return;
  markYesterdaySummaryShown();
  openYesterdaySummaryModal();
}


function checkForgottenSession() {
  if (!inactivite.enabled) return;
  if (state.status === 'idle') return;
  if (!state.startTs) return;
  const elapsedMs = Date.now() - state.startTs;
  const seuilMs = inactivite.seuilHeures * 3600000;
  if (elapsedMs >= seuilMs) {
    openForgottenSessionModal();
  }
}

function openForgottenSessionModal() {
  const modal = document.getElementById('forgottenSessionModal');
  if (!modal) return;
  const startEl = document.getElementById('forgottenSessionStart');
  const elapsedEl = document.getElementById('forgottenSessionElapsed');
  if (startEl) startEl.textContent = fmtTime(state.startTs) + ' (' + tsToKey(state.startTs) + ')';
  if (elapsedEl) elapsedEl.textContent = fmtHM(Date.now() - state.startTs);
  const suggestedEndInput = document.getElementById('forgottenSessionEndTime');
  if (suggestedEndInput) {
    const suggested = new Date(state.startTs);
    const dow = suggested.getDay();
    const jourGoalMs = (objectifs.parJour && typeof objectifs.parJour[dow] !== 'undefined') ? objectifs.parJour[dow] : objectifs.jour;
    suggested.setTime(state.startTs + (jourGoalMs || 8 * 3600000));
    suggestedEndInput.value = tsToTimeInput(suggested.getTime());
  }
  modal.style.display = 'flex';
}

function closeForgottenSessionModal() {
  const modal = document.getElementById('forgottenSessionModal');
  if (modal) modal.style.display = 'none';
}

function keepForgottenSessionRunning() {
  closeForgottenSessionModal();
  showToast('Session laissée en cours');
}

function fixForgottenSessionEnd() {
  const endTimeInput = document.getElementById('forgottenSessionEndTime');
  const errEl = document.getElementById('forgottenSessionError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (!endTimeInput) return;
  const startDate = new Date(state.startTs);
  const dateStr = toLocalISO(startDate);
  let endTs = combineDateTimeToTs(dateStr, endTimeInput.value);
  if (!Number.isNaN(endTs) && endTs <= state.startTs) {
    endTs += 24 * 3600000;
  }
  if (Number.isNaN(endTs) || endTs <= state.startTs) {
    if (errEl) { errEl.textContent = 'Heure de fin invalide.'; errEl.style.display = 'block'; }
    return;
  }
  stopTimer();
  const pauseMs = state.totalPauseMs + ((state.status === 'paused' && state.pauseStart) ? (endTs - state.pauseStart) : 0);
  const { start: finalStart, end: finalEnd } = applyArrondiToSession(state.startTs, endTs);
  const net = Math.max(0, (finalEnd - finalStart) - pauseMs);

  state.sessions.push({
    date: tsToKey(finalStart),
    start: finalStart,
    end: finalEnd,
    pauseMs,
    net,
    note: 'Session corrigée (oubli détecté)',
    startGeo: state.startGeo || null,
    endGeo: null,
    workMode: state.workMode || null,
  });

  state.status = 'idle';
  state.startTs = null;
  state.pauseStart = null;
  state.totalPauseMs = 0;
  state.startGeo = null;
  state.workMode = null;
  localStorage.removeItem('orvia_note_en_cours');
  document.getElementById('bigTime').textContent = '00:00:00';
  document.getElementById('bigTime').className = 'big-time';
  document.getElementById('elapsedLabel').textContent = 'Prêt à démarrer';
  document.getElementById('startTimeDisplay').textContent = '--:--';
  document.getElementById('pauseDisplay').textContent = '00:00';
  document.getElementById('netDisplay').textContent = '00:00';
  updateButtons();
  save();
  renderToday();
  closeForgottenSessionModal();
  showToast('Session corrigée ✓');
}

function roundTimestamp(ts, direction) {
  const stepMs = arrondi.minutes * 60000;
  if (direction === 'up') return Math.ceil(ts / stepMs) * stepMs;
  if (direction === 'down') return Math.floor(ts / stepMs) * stepMs;
  return Math.round(ts / stepMs) * stepMs;
}

function applyArrondiToSession(startTs, endTs) {
  if (!arrondi.enabled) return { start: startTs, end: endTs };
  let startDir = 'nearest';
  let endDir = 'nearest';
  if (arrondi.mode === 'favor_salarie') { startDir = 'down'; endDir = 'up'; }
  else if (arrondi.mode === 'favor_entreprise') { startDir = 'up'; endDir = 'down'; }
  const roundedStart = roundTimestamp(startTs, startDir);
  const roundedEnd = roundTimestamp(endTs, endDir);
  return { start: roundedStart, end: Math.max(roundedEnd, roundedStart) };
}

function calcNet(brutAmount) {
  if (!remuneration.netEnabled) return brutAmount;
  const taux = clampNumber(remuneration.tauxImposition, 0, 100, 22);
  return brutAmount * (1 - taux / 100);
}

function calcGainsSemaine(weekNetMs, dateStr) {
  if (!remuneration.enabled || !remuneration.tauxHoraire) return 0;
  const heures = weekNetMs / 3600000;
  const seuil1 = remuneration.seuil1;
  const seuil2 = remuneration.seuil2;
  // Utilise le taux en vigueur à la date fournie (historique des taux),
  // avec le taux actuel des réglages comme valeur par défaut (vue "aujourd'hui").
  const taux = dateStr ? getTauxHoraireForDate(dateStr) : remuneration.tauxHoraire;

  const heuresNormales = Math.min(heures, seuil1);
  const heuresTranche1 = Math.max(0, Math.min(heures, seuil2) - seuil1);
  const heuresTranche2 = remuneration.remuSupEnabled ? Math.max(0, heures - seuil2) : 0;

  const tauxTranche1 = taux * (1 + (remuneration.majorationTranche1 || 0) / 100);
  const tauxTranche2 = taux * (1 + (remuneration.majorationTranche2 || 0) / 100);

  return heuresNormales * taux + heuresTranche1 * tauxTranche1 + heuresTranche2 * tauxTranche2;
}

function calcGainsJour(dayNetMs, weekBeforeMs, dateStr) {
  if (!remuneration.enabled || !remuneration.tauxHoraire) return 0;
  return calcGainsSemaine((weekBeforeMs || 0) + dayNetMs, dateStr) - calcGainsSemaine(weekBeforeMs || 0, dateStr);
}

function calcTrancheGainForRange(cumulBeforeH, hoursH, taux, seuil1, seuil2, maj1, maj2) {
  const cumulAfterH = cumulBeforeH + hoursH;
  const normalH = Math.max(0, Math.min(cumulAfterH, seuil1) - Math.min(cumulBeforeH, seuil1));
  const tranche1H = Math.max(0, Math.min(cumulAfterH, seuil2) - Math.max(cumulBeforeH, seuil1));
  const tranche1HClamped = Math.max(0, Math.min(tranche1H, hoursH));
  const tranche2H = Math.max(0, cumulAfterH - Math.max(cumulBeforeH, seuil2));
  const tranche2HClamped = Math.max(0, Math.min(tranche2H, hoursH - normalH - tranche1HClamped));
  const tauxT1 = taux * (1 + (maj1 || 0) / 100);
  const tauxT2 = taux * (1 + (maj2 || 0) / 100);
  return normalH * taux + tranche1HClamped * tauxT1 + tranche2HClamped * tauxT2;
}

function calcGainsMois(year, month) {
  if (!remuneration.enabled || !remuneration.tauxHoraire) return 0;

  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  const relevantSessions = state.sessions.filter(s => {
    const mon = getMondayOf(new Date(s.start));
    const weekEnd = new Date(mon); weekEnd.setDate(mon.getDate() + 7);
    return weekEnd.getTime() > monthStart && mon.getTime() < monthEnd;
  });

  if (!relevantSessions.length) return 0;

  const byWeek = {};
  relevantSessions.forEach(s => {
    const mon = getMondayOf(new Date(s.start));
    const key = mon.getTime();
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(s);
  });

  const seuil1 = remuneration.seuil1;
  const seuil2 = remuneration.seuil2;
  const maj1 = remuneration.majorationTranche1;
  const maj2 = remuneration.majorationTranche2;

  let totalMonthGains = 0;

  // Le taux appliqué à chaque session est celui en vigueur à sa propre date
  // (historique des taux horaires), pas le taux actuel des réglages — ce qui
  // garde les calculs rétroactifs corrects après une augmentation de salaire.
  Object.keys(byWeek).forEach(key => {
    const weekSessions = byWeek[key].slice().sort((a, b) => a.start - b.start);
    let cumulH = 0;
    weekSessions.forEach(s => {
      const hoursH = (s.net || 0) / 3600000;
      const tauxSession = getTauxHoraireForDate(s.date);
      const gain = calcTrancheGainForRange(cumulH, hoursH, tauxSession, seuil1, seuil2, maj1, maj2);
      if (s.start >= monthStart && s.start < monthEnd) {
        totalMonthGains += gain;
      }
      cumulH += hoursH;
    });
  });

  return totalMonthGains;
}

// ── SÉCURITÉ / ÉCHAPPEMENT HTML ──
// Empêche l'injection HTML/JS via les notes de session (saisie utilisateur ou import de sauvegarde)
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtEuros(amount) {
  return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderRemunerationCardInto(elId, dayTotal, dayGoal, weekTotal, weekGoal) {
  const el = document.getElementById(elId);
  if (!el) return;

  if (!remuneration.enabled || !remuneration.tauxHoraire) {
    el.innerHTML = `
      <div class="objectif-card">
        <div style="font-size:13px;color:var(--muted);">
          Active la rémunération dans les Réglages pour voir tes gains estimés.
        </div>
      </div>
    `;
    return;
  }

  const gainsDayBrut = calcGainsJour(dayTotal, weekTotal - dayTotal);
  const gainsWeekBrut = calcGainsSemaine(weekTotal);
  const gainsDayNet = calcNet(gainsDayBrut);
  const gainsWeekNet = calcNet(gainsWeekBrut);
  const weekHeures = weekTotal / 3600000;
  const seuil1 = remuneration.seuil1;
  const seuil2 = remuneration.seuil2;

  let trancheInfo = '';
  if (weekHeures > seuil2) {
    trancheInfo = `Tranches: ${seuil1}h normal · ${seuil1}-${seuil2}h +${remuneration.majorationTranche1}% · au-delà +${remuneration.majorationTranche2}%`;
  } else if (weekHeures > seuil1) {
    trancheInfo = `Tranche ${seuil1}-${seuil2}h active: +${remuneration.majorationTranche1}%`;
  } else {
    trancheInfo = `Taux: ${remuneration.tauxHoraire.toLocaleString('fr-FR')} €/h (sous ${seuil1}h)`;
  }

  const now = new Date();
  const primesMonth = getPrimesForMonth(now.getFullYear(), now.getMonth());
  const gainsMonthBrut = calcGainsMois(now.getFullYear(), now.getMonth()) + primesMonth;
  const gainsMonthNet = calcNet(gainsMonthBrut);
  const primesRow = primesMonth > 0
    ? `<div style="font-size:11px;color:var(--accent2);margin-top:2px;font-weight:700;">+ ${fmtEuros(primesMonth)} de primes ce mois-ci</div>`
    : '';

  const netRow = remuneration.netEnabled
    ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Net estimé (−${remuneration.tauxImposition}%): <span style="color:var(--green);font-weight:700">${fmtEuros(gainsDayNet)}</span></div>`
    : '';
  const netRowWeek = remuneration.netEnabled
    ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Net estimé (−${remuneration.tauxImposition}%): <span style="color:var(--green);font-weight:700">${fmtEuros(gainsWeekNet)}</span></div>`
    : '';
  const netRowMonth = remuneration.netEnabled
    ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Net estimé (−${remuneration.tauxImposition}%): <span style="color:var(--green);font-weight:700">${fmtEuros(gainsMonthNet)}</span></div>`
    : '';

  el.innerHTML = `
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Gains du jour (brut)</span>
        <span class="objectif-values" style="color:var(--accent)">${fmtEuros(gainsDayBrut)}</span>
      </div>
      ${netRow}
    </div>
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Gains de la semaine (brut)</span>
        <span class="objectif-values" style="color:var(--accent)">${fmtEuros(gainsWeekBrut)}</span>
      </div>
      ${netRowWeek}
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">
        ${trancheInfo}
      </div>
    </div>
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Gains du mois (brut)</span>
        <span class="objectif-values" style="color:var(--accent)">${fmtEuros(gainsMonthBrut)}</span>
      </div>
      ${primesRow}
      ${netRowMonth}
    </div>
  `;
}

// ── HELPERS ──
function fmtHMS(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function fmtHM(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function fmtTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
}
function todayKey() { return new Date().toLocaleDateString('fr-FR'); }
function tsToKey(ts) { return new Date(ts).toLocaleDateString('fr-FR'); }

function toLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}


function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const _frHolidaysCache = {};

function getFrenchHolidays(year) {
  if (_frHolidaysCache[year]) return _frHolidaysCache[year];
  const easter = getEasterSunday(year);
  const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
  const ascension = new Date(easter); ascension.setDate(easter.getDate() + 39);
  const whitMonday = new Date(easter); whitMonday.setDate(easter.getDate() + 50);

  const fixed = [
    new Date(year, 0, 1),
    new Date(year, 4, 1),
    new Date(year, 4, 8),
    new Date(year, 6, 14),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
  ];

  const labels = {
    [`${year}-01-01`]: "Jour de l'An",
    [`${year}-05-01`]: "Fête du Travail",
    [`${year}-05-08`]: "Victoire 1945",
    [`${year}-07-14`]: "Fête nationale",
    [`${year}-08-15`]: "Assomption",
    [`${year}-11-01`]: "Toussaint",
    [`${year}-11-11`]: "Armistice",
    [`${year}-12-25`]: "Noël",
  };

  const all = [...fixed, easterMonday, ascension, whitMonday];
  const dateSet = new Set();
  all.forEach(d => {
    const key = toLocalISO(d);
    dateSet.add(key);
  });
  labels[toLocalISO(easterMonday)] = "Lundi de Pâques";
  labels[toLocalISO(ascension)] = "Ascension";
  labels[toLocalISO(whitMonday)] = "Lundi de Pentecôte";

  const result = { dateSet, labels };
  _frHolidaysCache[year] = result;
  return result;
}

function isDateHoliday(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  const { dateSet } = getFrenchHolidays(year);
  return dateSet.has(dateStr);
}

function getHolidayLabel(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  const { labels } = getFrenchHolidays(year);
  return labels[dateStr] || null;
}


// ── GEO ──
// ── MODE DE TRAVAIL (télétravail / présentiel) ──
function getWorkModeConfig() {
  const raw = localStorage.getItem('orvia_workmode_config');
  const allowedRadius = [100, 300, 500, 1000];
  if (!raw) return { enabled: false, lat: null, lng: null, radiusM: 300, label: '' };
  try {
    const p = JSON.parse(raw);
    return {
      enabled: !!p.enabled,
      lat: (p.lat !== null && p.lat !== undefined && Number.isFinite(Number(p.lat))) ? Number(p.lat) : null,
      lng: (p.lng !== null && p.lng !== undefined && Number.isFinite(Number(p.lng))) ? Number(p.lng) : null,
      radiusM: allowedRadius.includes(Number(p.radiusM)) ? Number(p.radiusM) : 300,
      label: typeof p.label === 'string' ? p.label.slice(0, 60) : '',
    };
  } catch (e) {
    return { enabled: false, lat: null, lng: null, radiusM: 300, label: '' };
  }
}

function saveWorkModeConfig(cfg) {
  localStorage.setItem('orvia_workmode_config', JSON.stringify(cfg));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectWorkMode(geo) {
  const cfg = getWorkModeConfig();
  if (!cfg.enabled || cfg.lat === null || cfg.lng === null || !geo) return null;
  const dist = distanceMeters(geo.lat, geo.lng, cfg.lat, cfg.lng);
  return dist <= cfg.radiusM ? 'presentiel' : 'teletravail';
}

async function getGeo() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        // Reverse geocode via nominatim
        try {
          // Nominatim exige une identification de l'app (politique d'usage), mais un
          // navigateur interdit de personnaliser l'en-tête User-Agent depuis fetch().
          // On s'assure donc que le Referer (seule identification possible côté client)
          // est bien transmis, ce que fait déjà nativement navigator sauf override.
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`, {
            headers: { 'Accept-Language': 'fr' },
            referrerPolicy: 'origin',
          });
          const d = await r.json();
          const addr = d.address;
          const label = [addr.road, addr.house_number, addr.city || addr.town || addr.village].filter(Boolean).join(' ');
          resolve({ lat, lng, label: label || `${lat}, ${lng}` });
        } catch {
          resolve({ lat, lng, label: `${lat}, ${lng}` });
        }
      },
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });
}

function geoMapsUrl(geo) {
  // Lien universel : s'ouvre dans l'app Google Maps sur Android et dans le
  // navigateur (ou l'app Google Maps si installée) sur iOS/desktop.
  return `https://www.google.com/maps?q=${geo.lat},${geo.lng}`;
}

// ── TIMER ──
function tick() {
  if (state.status === 'idle') return;
  const now = Date.now();
  let elapsed = now - state.startTs;
  let currentPause = state.totalPauseMs;
  let currentPauseOnly = 0;
  if (state.status === 'paused' && state.pauseStart) {
    currentPauseOnly = now - state.pauseStart;
    currentPause += currentPauseOnly;
  }
  const net = elapsed - currentPause;

  document.getElementById('pauseDisplay').textContent = fmtHM(currentPause);
  document.getElementById('netDisplay').textContent = fmtHM(net);

      const el = document.getElementById('bigTime');
  if (state.status === 'paused') {
    el.textContent = fmtHMS(currentPauseOnly);
    document.getElementById('elapsedLabel').textContent = 'En pause depuis…';
  } else {
     el.textContent = fmtHMS(net);
    document.getElementById('elapsedLabel').textContent = 'En cours…';
  }
  el.className = 'big-time ' + (state.status === 'paused' ? 'paused' : 'running');
  const _nowSec = Math.floor(now / 1000);
  if (_nowSec % 15 === 0 || window._lastObjRender === undefined) { window._lastObjRender = _nowSec; renderObjectifs(); }
  checkPauseReminder();
}

function startTimer() { if (timerInterval) return; timerInterval = setInterval(tick, 1000); tick(); }
function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

// ── ACTIONS ──
function handleMainBtn() {
  if (state.status === 'idle') {
    // START
    state.startTs = Date.now();
    state.totalPauseMs = 0;
    state.pauseStart = null;
    state.startGeo = null;
    state.workMode = null;
    state.status = 'running';
    document.getElementById('startTimeDisplay').textContent = fmtTime(state.startTs);
    document.getElementById('elapsedLabel').textContent = 'En cours…';
    updateButtons();
    startTimer();
    save();
    showToast('Session démarrée ✓');
    // Fetch geo in background
    getGeo().then(geo => { if (geo) { state.startGeo = geo; state.workMode = detectWorkMode(geo); save(); } });
  } else if (state.status === 'running') {
    // PAUSE
    state.pauseStart = Date.now();
    state.status = 'paused';
    document.getElementById('elapsedLabel').textContent = 'En pause depuis…';
    updateButtons();
    save();
    tick();
    showToast('Pause déjeuner ☕');
  } else if (state.status === 'paused') {
    // RESUME
    state.totalPauseMs += Date.now() - state.pauseStart;
    state.pauseStart = null;
    state.status = 'running';
    document.getElementById('elapsedLabel').textContent = 'En cours…';
    updateButtons();
    save();
    showToast('Reprise du travail ✓');
  }
}

async function stopSession() {
  if (state.status === 'idle') return;
  stopTimer();

  const rawEndTs = Date.now();
  let pauseMs = state.totalPauseMs;
  if (state.status === 'paused' && state.pauseStart) {
    pauseMs += rawEndTs - state.pauseStart;
  }
  const note = document.getElementById('noteInput').value.trim();

  const { start: finalStart, end: finalEnd } = applyArrondiToSession(state.startTs, rawEndTs);
  const net = Math.max(0, (finalEnd - finalStart) - pauseMs);

  const newSession = {
    date: tsToKey(finalStart),
    start: finalStart,
    end: finalEnd,
    pauseMs,
    net,
    note: note || 'Session de travail',
    startGeo: state.startGeo || null,
    endGeo: null,
    workMode: state.workMode || null,
  };
  state.sessions.push(newSession);

  // reset
  state.status = 'idle';
  state.startTs = null;
  state.pauseStart = null;
  state.totalPauseMs = 0;
  state.workMode = null;
  state.startGeo = null;
  localStorage.removeItem('orvia_note_en_cours');
  document.getElementById('noteInput').value = '';
  document.getElementById('bigTime').textContent = '00:00:00';
  document.getElementById('bigTime').className = 'big-time';
  document.getElementById('elapsedLabel').textContent = 'Prêt à démarrer';
  document.getElementById('startTimeDisplay').textContent = '--:--';
  document.getElementById('pauseDisplay').textContent = '00:00';
  document.getElementById('netDisplay').textContent = '00:00';
  updateButtons();
  save();
  renderToday();
  showToast('Session enregistrée ✓');

  // La géolocalisation ne doit jamais retarder l'enregistrement de la session :
  // elle est résolue en arrière-plan et vient compléter la session une fois disponible.
  getGeo().then(endGeo => {
    if (endGeo) {
      newSession.endGeo = endGeo;
      save();
      renderToday();
    }
  });
}

function updateButtons() {
  const row = document.getElementById('btnRow');
  if (state.status === 'idle') {
    row.innerHTML = `<button class="btn btn-start" onclick="handleMainBtn()">▶ Démarrer</button>`;
  } else if (state.status === 'running') {
    row.innerHTML = `
      <button class="btn btn-pause" onclick="handleMainBtn()">⏸ Pause</button>
      <button class="btn btn-stop" onclick="stopSession()">⏹ Terminer</button>`;
  } else {
    row.innerHTML = `
      <button class="btn btn-resume" onclick="handleMainBtn()">▶ Reprendre</button>
      <button class="btn btn-stop" onclick="stopSession()">⏹ Terminer</button>`;
  }
}

// ── RENDER TODAY ──
function renderToday() {
  const today = todayKey();
  const todaySessions = state.sessions.filter(s => s.date === today);
  const container = document.getElementById('todaySessions');
  const empty = document.getElementById('emptyToday');

  if (!todaySessions.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    container.innerHTML = todaySessions.map(s => sessionItemHtml(s)).join('');
  }
  renderObjectifs();
  renderDailyCompliance();
}


function getReminderConfig() {
  const raw = localStorage.getItem('orvia_reminder');
  if (!raw) return { enabled: false, time: '09:30', firedDate: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      time: /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : '09:30',
      firedDate: typeof parsed.firedDate === 'string' ? parsed.firedDate : null
    };
  } catch(e) {
    return { enabled: false, time: '09:30', firedDate: null };
  }
}

function saveReminderConfig(cfg) {
  localStorage.setItem('orvia_reminder', JSON.stringify(cfg));
}

function renderReminderSettings() {
  const cfg = getReminderConfig();
  const enabledEl = document.getElementById('reminderEnabled');
  const timeEl = document.getElementById('reminderTime');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (timeEl) timeEl.value = cfg.time;
  updateReminderSummary(cfg);
}

function updateReminderSummary(cfg) {
  const summaryEl = document.getElementById('reminderSummary');
  if (!summaryEl) return;
  summaryEl.textContent = cfg.enabled
    ? `Actif à ${cfg.time} si aucune session démarrée`
    : 'Notification si aucune session démarrée';
}

function onReminderToggle() {
  const cfg = getReminderConfig();
  const enabledEl = document.getElementById('reminderEnabled');
  cfg.enabled = enabledEl ? enabledEl.checked : false;
  cfg.firedDate = null;
  saveReminderConfig(cfg);
  updateReminderSummary(cfg);
  if (cfg.enabled && ('Notification' in window) && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  showToast(cfg.enabled ? 'Rappel activé ✓' : 'Rappel désactivé');
}

function onReminderTimeChange() {
  const cfg = getReminderConfig();
  const timeEl = document.getElementById('reminderTime');
  cfg.time = timeEl && /^\d{2}:\d{2}$/.test(timeEl.value) ? timeEl.value : '09:30';
  cfg.firedDate = null;
  saveReminderConfig(cfg);
  showToast(`Heure du rappel : ${cfg.time}`);
}

function checkReminderTrigger() {
  const cfg = getReminderConfig();
  if (!cfg.enabled) return;

  const now = new Date();
  const today = todayKey();
  if (cfg.firedDate === today) return;

  const [hh, mm] = cfg.time.split(':').map(Number);
  const targetMinutes = hh * 60 + mm;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < targetMinutes) return;

  const hasSessionToday = state.sessions.some(s => s.date === today);
  const isActive = state.status !== 'idle';
  if (hasSessionToday || isActive) {
    cfg.firedDate = today;
    saveReminderConfig(cfg);
    return;
  }

  cfg.firedDate = today;
  saveReminderConfig(cfg);

  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  if (canNotify) {
    orviaNotify('Rappel Orvia ⏰', { body: "Tu n'as pas encore démarré de session aujourd'hui." });
  }
  showToast("⏰ Rappel : aucune session démarrée aujourd'hui");
}

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

