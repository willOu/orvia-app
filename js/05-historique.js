// ── RENDER HISTORY ──
let currentView = 'day';

function setView(v) {
  currentView = v;
  document.querySelectorAll('.hist-view-btn').forEach((b, i) => {
    b.classList.toggle('active', ['day','week','month','year'][i] === v);
  });
  const listEl = document.getElementById('historyList');
  if (listEl) {
    listEl.classList.add('view-transitioning');
    setTimeout(() => {
      renderHistory();
      requestAnimationFrame(() => listEl.classList.remove('view-transitioning'));
    }, 160);
  } else {
    renderHistory();
  }
}

function getWeekKey(ts) {
  const d = new Date(ts);
  const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = t => t.toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
  return { key: mon.getTime(), label: `${fmt(mon)} – ${fmt(sun)}` };
}

function getYearKey(ts) {
  const d = new Date(ts);
  return { key: d.getFullYear(), label: String(d.getFullYear()) };
}


let _editTimeIdx = null;

function tsToDateInput(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function tsToTimeInput(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function combineDateTimeToTs(dateStr, timeStr) {
  if (!dateStr || !/^\d{2}:\d{2}$/.test(timeStr)) return NaN;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return NaN;
  d.setHours(h, m, 0, 0);
  return d.getTime();
}


function openAddSessionModal() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  document.getElementById('addSessionDate').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('addSessionStart').value = '09:00';
  document.getElementById('addSessionEnd').value = '17:00';
  document.getElementById('addSessionPause').value = '0';
  document.getElementById('addSessionNote').value = '';
  const errEl = document.getElementById('addSessionError');
  errEl.style.display = 'none';
  errEl.textContent = '';
  document.getElementById('addSessionModal').style.display = 'flex';
}

function closeAddSessionModal() {
  document.getElementById('addSessionModal').style.display = 'none';
}

function sessionsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function saveAddSessionModal() {
  const dateStr = document.getElementById('addSessionDate').value;
  const startStr = document.getElementById('addSessionStart').value;
  const endStr = document.getElementById('addSessionEnd').value;
  const pauseMin = Number(document.getElementById('addSessionPause').value);
  const note = document.getElementById('addSessionNote').value.trim();
  const errEl = document.getElementById('addSessionError');

  let newStart = combineDateTimeToTs(dateStr, startStr);
  let newEnd = combineDateTimeToTs(dateStr, endStr);

  if (Number.isNaN(newStart) || Number.isNaN(newEnd)) {
    errEl.textContent = 'Date ou heure invalide.';
    errEl.style.display = 'block';
    return;
  }

  if (newEnd <= newStart) {
    newEnd += 24 * 3600000;
  }

  if (arrondi.enabled) {
    const rounded = applyArrondiToSession(newStart, newEnd);
    newStart = rounded.start;
    newEnd = rounded.end;
  }

  const duration = newEnd - newStart;
  if (duration > 20 * 3600000) {
    errEl.textContent = 'Durée trop longue (max 20h).';
    errEl.style.display = 'block';
    return;
  }

  if (!Number.isFinite(pauseMin) || pauseMin < 0) {
    errEl.textContent = 'Pause invalide.';
    errEl.style.display = 'block';
    return;
  }

  const pauseMs = Math.min(pauseMin * 60000, duration);

  const overlapping = state.sessions.some(s => sessionsOverlap(newStart, newEnd, s.start, s.end));
  if (overlapping) {
    errEl.textContent = 'Cette session chevauche une session existante.';
    errEl.style.display = 'block';
    return;
  }

  const net = Math.max(0, duration - pauseMs);

  state.sessions.push({
    date: tsToKey(newStart),
    start: newStart,
    end: newEnd,
    pauseMs,
    net,
    note: note || 'Session ajoutée manuellement'
  });
  state.sessions.sort((a, b) => a.start - b.start);

  save();
  closeAddSessionModal();
  renderToday();
  renderHistory();
  showToast('Session ajoutée ✓');
}

function openEditTimeModal(idx) {
  const s = state.sessions[idx];
  if (!s) return;
  _editTimeIdx = idx;
  document.getElementById('editTimeDate').value = tsToDateInput(s.start);
  document.getElementById('editTimeStart').value = tsToTimeInput(s.start);
  document.getElementById('editTimeEnd').value = tsToTimeInput(s.end);
  const pauseEl = document.getElementById('editTimePause');
  if (pauseEl) pauseEl.value = Math.round((s.pauseMs || 0) / 60000);
  const editNoteEl=document.getElementById('editTimeNote');
  if(editNoteEl)editNoteEl.value=s.note||'';
  const errEl = document.getElementById('editTimeError');
  errEl.style.display = 'none';
  errEl.textContent = '';
  document.getElementById('editTimeModal').style.display = 'flex';
}

function closeEditTimeModal() {
  document.getElementById('editTimeModal').style.display = 'none';
  _editTimeIdx = null;
}

function saveEditTimeModal() {
  if (_editTimeIdx === null) return;
  const s = state.sessions[_editTimeIdx];
  const _editTimeIdxLocal = _editTimeIdx;
  if (!s) { closeEditTimeModal(); return; }

  const dateStr = document.getElementById('editTimeDate').value;
  const startStr = document.getElementById('editTimeStart').value;
  const endStr = document.getElementById('editTimeEnd').value;
  const errEl = document.getElementById('editTimeError');

  let newStart = combineDateTimeToTs(dateStr, startStr);
  let newEnd = combineDateTimeToTs(dateStr, endStr);

  if (Number.isNaN(newStart) || Number.isNaN(newEnd)) {
    errEl.textContent = 'Date ou heure invalide.';
    errEl.style.display = 'block';
    return;
  }

  if (newEnd <= newStart) {
    newEnd += 24 * 3600000;
  }

  if (arrondi.enabled) {
    const rounded = applyArrondiToSession(newStart, newEnd);
    newStart = rounded.start;
    newEnd = rounded.end;
  }

  const duration = newEnd - newStart;
  if (duration > 20 * 3600000) {
    errEl.textContent = 'Durée trop longue (max 20h). Vérifie les horaires.';
    errEl.style.display = 'block';
    return;
  }

  const overlapping = state.sessions.some((other, i) => i !== _editTimeIdxLocal && sessionsOverlap(newStart, newEnd, other.start, other.end));
  if (overlapping) {
    errEl.textContent = 'Ces horaires chevauchent une autre session.';
    errEl.style.display = 'block';
    return;
  }

  const pauseEl = document.getElementById('editTimePause');
  const requestedPauseMs = pauseEl ? Math.max(0, Math.round(Number(pauseEl.value) || 0) * 60000) : (s.pauseMs || 0);
  const clampedPause = Math.min(requestedPauseMs, duration);
  const newNet = Math.max(0, duration - clampedPause);

  const noteVal=document.getElementById('editTimeNote');
  if(noteVal)s.note=noteVal.value.trim();
  const oldStart = s.start, oldEnd = s.end, oldPauseMs = s.pauseMs;
  s.start = newStart;
  s.end = newEnd;
  s.pauseMs = clampedPause;
  s.net = newNet;
  s.date = tsToKey(newStart);

  save();
  logAuditEntry('session', 'modification', `${fmtTime(oldStart)}-${fmtTime(oldEnd)} (pause ${Math.round((oldPauseMs||0)/60000)}min) → ${fmtTime(newStart)}-${fmtTime(newEnd)} (pause ${Math.round(clampedPause/60000)}min), le ${new Date(newStart).toLocaleDateString('fr-FR')}`);
  closeEditTimeModal();
  renderToday();
  renderHistory();
  showToast('Horaires mis à jour ✓');
}


// ── AJUSTEMENT DE LA PAUSE EN COURS (session active) ──
// Permet de corriger le temps de pause d'une session en cours (running ou
// paused), sans devoir attendre la fin pour passer par "Modifier les
// horaires" (qui ne s'applique qu'aux sessions déjà terminées).
function openEditCurrentPauseModal() {
  if (state.status === 'idle') { showToast('Aucune session en cours'); return; }
  let currentPause = state.totalPauseMs || 0;
  if (state.status === 'paused' && state.pauseStart) {
    currentPause += Date.now() - state.pauseStart;
  }
  const minutesEl = document.getElementById('editCurrentPauseMinutes');
  if (minutesEl) minutesEl.value = Math.round(currentPause / 60000);
  const errEl = document.getElementById('editCurrentPauseError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  document.getElementById('editCurrentPauseModal').style.display = 'flex';
}

function closeEditCurrentPauseModal() {
  document.getElementById('editCurrentPauseModal').style.display = 'none';
}

function saveEditCurrentPauseModal() {
  if (state.status === 'idle') { closeEditCurrentPauseModal(); return; }
  const minutesEl = document.getElementById('editCurrentPauseMinutes');
  const errEl = document.getElementById('editCurrentPauseError');
  const minutes = minutesEl ? Number(minutesEl.value) : NaN;

  if (!Number.isFinite(minutes) || minutes < 0) {
    if (errEl) { errEl.textContent = 'Valeur invalide.'; errEl.style.display = 'block'; }
    return;
  }

  const elapsedSinceStart = Date.now() - state.startTs;
  const requestedPauseMs = Math.round(minutes) * 60000;

  if (requestedPauseMs > elapsedSinceStart) {
    if (errEl) { errEl.textContent = 'La pause ne peut pas dépasser la durée écoulée depuis le départ.'; errEl.style.display = 'block'; }
    return;
  }

  if (state.status === 'paused' && state.pauseStart) {
    // La pause active en cours est incluse dans la nouvelle valeur totale :
    // on repart d'un nouveau pauseStart pour que le calcul en direct reste cohérent.
    state.totalPauseMs = requestedPauseMs - (Date.now() - state.pauseStart);
    if (state.totalPauseMs < 0) state.totalPauseMs = 0;
  } else {
    state.totalPauseMs = requestedPauseMs;
  }

  save();
  tick();
  closeEditCurrentPauseModal();
  showToast('Pause ajustée ✓');
}

// Permet de corriger l'heure d'arrivée immédiatement au démarrage d'une
// session, sans avoir à attendre la fin pour la corriger via l'historique.
function openEditCurrentStartModal() {
  if (state.status === 'idle') { showToast('Aucune session en cours'); return; }
  const timeEl = document.getElementById('editCurrentStartTime');
  if (timeEl && state.startTs) {
    const d = new Date(state.startTs);
    timeEl.value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  const errEl = document.getElementById('editCurrentStartError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  document.getElementById('editCurrentStartModal').style.display = 'flex';
}

function closeEditCurrentStartModal() {
  document.getElementById('editCurrentStartModal').style.display = 'none';
}

function saveEditCurrentStartModal() {
  if (state.status === 'idle') { closeEditCurrentStartModal(); return; }
  const timeEl = document.getElementById('editCurrentStartTime');
  const errEl = document.getElementById('editCurrentStartError');
  const val = timeEl ? timeEl.value : '';

  if (!val || !/^\d{2}:\d{2}$/.test(val)) {
    if (errEl) { errEl.textContent = 'Heure invalide.'; errEl.style.display = 'block'; }
    return;
  }

  const [hh, mm] = val.split(':').map(Number);
  const newStart = new Date(state.startTs);
  newStart.setHours(hh, mm, 0, 0);
  const newStartTs = newStart.getTime();
  const now = Date.now();

  if (newStartTs > now) {
    if (errEl) { errEl.textContent = "L'heure d'arrivée ne peut pas être dans le futur."; errEl.style.display = 'block'; }
    return;
  }

  const totalPauseNow = state.totalPauseMs + (state.status === 'paused' && state.pauseStart ? (now - state.pauseStart) : 0);
  if ((now - newStartTs) < totalPauseNow) {
    if (errEl) { errEl.textContent = "Cette heure d'arrivée est trop récente par rapport à la pause déjà accumulée."; errEl.style.display = 'block'; }
    return;
  }

  const oldLabel = fmtTime(state.startTs);
  state.startTs = newStartTs;
  document.getElementById('startTimeDisplay').textContent = fmtTime(state.startTs);
  save();
  tick();
  closeEditCurrentStartModal();
  if (typeof logAuditEntry === 'function') logAuditEntry('session', 'modification', `Heure d'arrivée corrigée : ${oldLabel} → ${fmtTime(state.startTs)}`);
  showToast("Heure d'arrivée corrigée ✓");
}

function editNote(idx) {
  const s = state.sessions[idx];
  const el = document.getElementById('note-' + idx);
  const newNote = prompt('Modifier le commentaire :', s.note);
  if (newNote === null) return; // annulé
  state.sessions[idx].note = newNote.trim();
  save();
  renderToday();
  renderHistory();
  showToast('Commentaire mis à jour ✓');
}


function detectSessionAnomalies(s) {
  const issues = [];
  if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) {
    issues.push('dates invalides');
    return issues;
  }
  const duration = s.end - s.start;
  if (duration <= 0) issues.push('fin avant ou égale au début');
  if (s.pauseMs > duration) issues.push('pause plus longue que la durée totale');
  if (s.net > duration) issues.push('net supérieur à la durée totale');
  const expectedNet = duration - (s.pauseMs || 0);
  if (Math.abs((s.net || 0) - expectedNet) > 60000) issues.push('net incohérent avec durée - pause');
  if (duration > 16 * 3600000) issues.push('session anormalement longue (>16h)');
  if (s.pauseMs < 0) issues.push('pause négative');
  if (s.net < 0) issues.push('net négatif');
  return issues;
}

function getAllAnomalies() {
  return state.sessions
    .map((s, idx) => ({ idx, session: s, issues: detectSessionAnomalies(s) }))
    .filter(r => r.issues.length > 0);
}


// ══════════════════════════════════════════════════════════
// DÉTECTION D'ANOMALIES ENRICHIE
// Complète les vérifications existantes (cohérence net/pause/durée) avec
// des seuils configurables sur la durée de pause relative à la session,
// et une détection de session "suspecte" (durée totale anormalement longue,
// ex: 18h d'affilée) pour proposer une vérification proactive.
// ══════════════════════════════════════════════════════════

function getAnomalyThresholds() {
  try {
    const raw = localStorage.getItem('orvia_anomaly_thresholds');
    const p = raw ? JSON.parse(raw) : {};
    return {
      maxSessionHours: Number.isFinite(Number(p.maxSessionHours)) ? clampNumber(Number(p.maxSessionHours), 8, 24, 16) : 16,
      minPauseMinutesIfLong: Number.isFinite(Number(p.minPauseMinutesIfLong)) ? clampNumber(Number(p.minPauseMinutesIfLong), 0, 120, 20) : 20,
      longSessionHoursForPauseCheck: Number.isFinite(Number(p.longSessionHoursForPauseCheck)) ? clampNumber(Number(p.longSessionHoursForPauseCheck), 4, 14, 6) : 6,
      maxPauseRatioPct: Number.isFinite(Number(p.maxPauseRatioPct)) ? clampNumber(Number(p.maxPauseRatioPct), 20, 90, 60) : 60
    };
  } catch (e) {
    return { maxSessionHours: 16, minPauseMinutesIfLong: 20, longSessionHoursForPauseCheck: 6, maxPauseRatioPct: 60 };
  }
}

function saveAnomalyThresholds(cfg) {
  localStorage.setItem('orvia_anomaly_thresholds', JSON.stringify(cfg));
}

// Étend detectSessionAnomalies avec des vérifications supplémentaires basées
// sur les seuils configurables (pause trop courte pour une session longue,
// pause disproportionnée par rapport au temps net, session suspecte).
function detectSessionAnomaliesExtended(s) {
  const issues = detectSessionAnomalies(s);
  if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) return issues;

  const cfg = getAnomalyThresholds();
  const durationH = (s.end - s.start) / 3600000;
  const pauseMin = (s.pauseMs || 0) / 60000;

  if (durationH >= cfg.maxSessionHours && !issues.some(i => i.includes('anormalement longue'))) {
    issues.push(`session très longue (${durationH.toFixed(1)}h, ≥ ${cfg.maxSessionHours}h)`);
  }

  if (durationH >= cfg.longSessionHoursForPauseCheck && pauseMin < cfg.minPauseMinutesIfLong) {
    issues.push(`pause suspicieusement courte (${Math.round(pauseMin)} min sur ${durationH.toFixed(1)}h)`);
  }

  if (durationH > 0) {
    const pauseRatioPct = (pauseMin * 60000 / (s.end - s.start)) * 100;
    if (pauseRatioPct > cfg.maxPauseRatioPct) {
      issues.push(`pause disproportionnée (${Math.round(pauseRatioPct)}% de la session)`);
    }
  }

  return issues;
}

function getAllAnomaliesExtended() {
  return state.sessions
    .map((s, idx) => ({ idx, session: s, issues: detectSessionAnomaliesExtended(s) }))
    .filter(r => r.issues.length > 0);
}

function renderAnomalySettings() {
  const cfg = getAnomalyThresholds();
  const el1 = document.getElementById('anomalyMaxSessionHours');
  const el2 = document.getElementById('anomalyMinPauseMinutes');
  const el3 = document.getElementById('anomalyLongSessionThreshold');
  const el4 = document.getElementById('anomalyMaxPauseRatio');
  if (el1) el1.value = cfg.maxSessionHours;
  if (el2) el2.value = cfg.minPauseMinutesIfLong;
  if (el3) el3.value = cfg.longSessionHoursForPauseCheck;
  if (el4) el4.value = cfg.maxPauseRatioPct;

  const summaryEl = document.getElementById('anomalyDetectedSummary');
  if (summaryEl) {
    const anomalies = getAllAnomaliesExtended();
    summaryEl.innerHTML = anomalies.length
      ? `<div style="font-size:12px;color:var(--orange);font-weight:700;">${anomalies.length} session(s) signalée(s) avec les seuils actuels.</div>`
      : `<div style="font-size:12px;color:var(--green);">Aucune anomalie détectée avec ces seuils.</div>`;
  }
}

function onAnomalyThresholdsChange() {
  const cfg = {
    maxSessionHours: Number(document.getElementById('anomalyMaxSessionHours')?.value),
    minPauseMinutesIfLong: Number(document.getElementById('anomalyMinPauseMinutes')?.value),
    longSessionHoursForPauseCheck: Number(document.getElementById('anomalyLongSessionThreshold')?.value),
    maxPauseRatioPct: Number(document.getElementById('anomalyMaxPauseRatio')?.value)
  };
  saveAnomalyThresholds(cfg);
  showToast('Seuils mis à jour ✓');
  renderAnomalySettings();
  renderAnomalyBanner();
  renderHistory();
}

function openAnomalySettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-anomaly-settings').classList.add('active');
  renderAnomalySettings();
}

function fixSessionAnomaly(idx) {
  const s = state.sessions[idx];
  if (!s) return;
  const duration = Math.max(0, (s.end || 0) - (s.start || 0));
  s.pauseMs = clampNumber(s.pauseMs, 0, duration, 0);
  s.net = Math.max(0, duration - s.pauseMs);
  save();
  renderHistory();
  renderToday();
  showToast('Session corrigée ✓');
}

function sessionItemHtml(s) {
  const globalIdx = state.sessions.indexOf(s);
  const startGeoHtml = s.startGeo
    ? `<div class="geo-badge">📍 <a href="${geoMapsUrl(s.startGeo)}" target="_blank">${escapeHtml(s.startGeo.label)}</a></div>`
    : '';
  const endGeoHtml = s.endGeo
    ? `<div class="geo-badge geo-end">🏁 <a href="${geoMapsUrl(s.endGeo)}" target="_blank">${escapeHtml(s.endGeo.label)}</a></div>`
    : '';
  const workModeHtml = s.workMode === 'presentiel'
    ? `<div class="geo-badge" style="color:var(--accent)">🏢 Présentiel</div>`
    : s.workMode === 'teletravail'
    ? `<div class="geo-badge" style="color:var(--green)">🏠 Télétravail</div>`
    : '';
  const anomalies = detectSessionAnomaliesExtended(s);
  const anomalyHtml = anomalies.length
    ? `<div style="background:rgba(245,158,11,.12);border:1px solid var(--orange);border-radius:8px;padding:6px 10px;font-size:11px;color:var(--orange);display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>⚠️ ${anomalies.join(', ')}</span>
        <button onclick="fixSessionAnomaly(${globalIdx})" style="background:var(--orange);color:#0b1f2a;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">Corriger</button>
      </div>`
    : '';
  return `
  <div class="session-item" style="flex-direction:column;align-items:stretch;gap:8px${anomalies.length ? ';border-color:var(--orange)' : ''}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="session-left">
        <div class="session-time" onclick="openEditTimeModal(${globalIdx})" style="cursor:pointer" title="Toucher pour modifier les horaires">${fmtTime(s.start)} → ${fmtTime(s.end)} <span style="font-size:11px;color:var(--muted)">✏️</span></div>
        <div class="session-note" id="note-${globalIdx}" onclick="editNote(${globalIdx})" style="cursor:pointer" title="Toucher pour modifier">
          ${escapeHtml(s.note)} <span style="font-size:11px;color:var(--muted)">✏️</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <div style="text-align:right">
          <div class="session-duration">${fmtHM(s.net)}</div>
          <div class="session-pause-badge">pause ${fmtHM(s.pauseMs)}</div>
        </div>
        <button class="session-delete" onclick="deleteSession(${globalIdx})">✕</button>
      </div>
    </div>
    ${anomalyHtml}
    ${workModeHtml}
    ${startGeoHtml}${endGeoHtml}
  </div>`;
}


function renderAnomalyBanner() {
  let banner = document.getElementById('anomalyBanner');
  const anomalies = getAllAnomaliesExtended();
  if (!banner) return;
  if (!anomalies.length) {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="background:rgba(245,158,11,.12);border:1px solid var(--orange);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--orange);font-size:13px;margin-bottom:4px;">⚠️ ${anomalies.length} session(s) avec incohérence détectée</div>
      <div style="font-size:12px;color:var(--muted);">Vérifie les sessions signalées en orange ci-dessous et corrige-les si besoin.</div>
    </div>`;
}

function getMonthComparison() {
  const now = new Date();
  const day = now.getDate();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = prevMonthRef.getTime();
  // Compare sur le même nombre de jours écoulés (comparaison équitable, pas mois entier vs mois partiel)
  const daysInPrevMonth = new Date(prevMonthRef.getFullYear(), prevMonthRef.getMonth() + 1, 0).getDate();
  const cutoffDay = Math.min(day, daysInPrevMonth);
  const prevMonthCutoff = new Date(prevMonthRef.getFullYear(), prevMonthRef.getMonth(), cutoffDay, 23, 59, 59, 999).getTime();

  const thisMonthMs = state.sessions.filter(s => s.start >= thisMonthStart && s.start <= now.getTime()).reduce((a, s) => a + s.net, 0);
  const prevMonthMs = state.sessions.filter(s => s.start >= prevMonthStart && s.start <= prevMonthCutoff).reduce((a, s) => a + s.net, 0);

  return { thisMonthMs, prevMonthMs, diffMs: thisMonthMs - prevMonthMs, cutoffDay, day };
}

function fmtSignedHM(ms) {
  const sign = ms < 0 ? '-' : '+';
  return sign + fmtHM(Math.abs(ms));
}

function renderHistory() {
  // stats
  const totalMs = state.sessions.reduce((a, s) => a + s.net, 0);
  const days = [...new Set(state.sessions.map(s => s.date))].length;
  const thisWeek = getWeekSessions();
  const weekMs = thisWeek.reduce((a, s) => a + s.net, 0);
  const cmp = getMonthComparison();
  const cmpColor = cmp.diffMs > 0 ? 'var(--green)' : (cmp.diffMs < 0 ? 'var(--accent2)' : 'var(--muted)');
  const cmpIcon = cmp.diffMs > 0 ? '📈' : (cmp.diffMs < 0 ? '📉' : '➖');

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-val">${fmtHM(weekMs)}</div>
      <div class="stat-lbl">Cette semaine</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${days}</div>
      <div class="stat-lbl">Jours enregistrés</div>
    </div>
    <div class="stat-card full">
      <div class="stat-val" style="color:var(--green)">${fmtHM(totalMs)}</div>
      <div class="stat-lbl">Total cumulé</div>
    </div>
    <div class="stat-card full">
      <div class="stat-val" style="color:${cmpColor};font-size:20px;">${cmpIcon} ${fmtSignedHM(cmp.diffMs)}</div>
      <div class="stat-lbl">vs mois dernier (sur les ${cmp.day} 1ers jours)</div>
    </div>`;

  renderAnomalyBanner();

  const list = document.getElementById('historyList');
  const empty = document.getElementById('emptyHistory');
  if (!state.sessions.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  if (currentView === 'day') {
    // group by date
    const byDate = {};
    state.sessions.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    const sorted = Object.keys(byDate).sort((a, b) => byDate[b][0].start - byDate[a][0].start);
    list.innerHTML = sorted.map(date => {
      const sessions = byDate[date];
      const dayNet = sessions.reduce((a, s) => a + s.net, 0);
      return `<div class="day-group">
        <div class="day-header" onclick="openDayEditor('${date}')" style="cursor:pointer" title="Toucher pour corriger la journée">
          <span class="day-label">${date} <span style="font-size:11px;color:var(--muted)">✏️</span></span>
          <span class="day-total">${fmtHM(dayNet)}</span>
        </div>
        ${sessions.map(sessionItemHtml).join('')}
      </div>`;
    }).join('');

  } else if (currentView === 'week') {
    // group by week then by day inside
    const byWeek = {};
    state.sessions.forEach(s => {
      const {key, label} = getWeekKey(s.start);
      if (!byWeek[key]) byWeek[key] = {label, sessions: []};
      byWeek[key].sessions.push(s);
    });
    const sortedWeeks = Object.keys(byWeek).sort((a,b) => b - a);
    list.innerHTML = sortedWeeks.map(wk => {
      const {label, sessions} = byWeek[wk];
      const weekNet = sessions.reduce((a,s) => a+s.net, 0);
      // sub-group by day
      const byDay = {};
      sessions.forEach(s => { if (!byDay[s.date]) byDay[s.date] = []; byDay[s.date].push(s); });
      const sortedDays = Object.keys(byDay).sort((a,b) => byDay[b][0].start - byDay[a][0].start);
      return `<div class="day-group">
        <div class="group-header">
          <span class="group-label">📅 ${label}</span>
          <span class="group-total">${fmtHM(weekNet)}</span>
        </div>
        ${sortedDays.map(date => {
          const ds = byDay[date];
          const dayNet = ds.reduce((a,s) => a+s.net, 0);
          return `<div class="day-subheader" onclick="openDayEditor('${date}')" style="cursor:pointer" title="Toucher pour corriger la journée">
            <span class="day-sublabel">${date} <span style="font-size:11px">✏️</span></span>
            <span class="day-subtotal">${fmtHM(dayNet)}</span>
          </div>
          ${ds.map(sessionItemHtml).join('')}`;
        }).join('')}
      </div>`;
    }).join('');

  } else if (currentView === 'year') {
    // group by year then by month
    const byYear = {};
    state.sessions.forEach(s => {
      const {key, label} = getYearKey(s.start);
      if (!byYear[key]) byYear[key] = {label, sessions: []};
      byYear[key].sessions.push(s);
    });
    const sortedYears = Object.keys(byYear).sort((a,b) => b - a);
    list.innerHTML = sortedYears.map(yr => {
      const {label, sessions} = byYear[yr];
      const yearNet = sessions.reduce((a,s) => a+s.net, 0);
      // sub-group by month
      const byMonth = {};
      sessions.forEach(s => {
        const d = new Date(s.start);
        const mk = d.getFullYear() * 100 + d.getMonth();
        const ml = d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
        if (!byMonth[mk]) byMonth[mk] = {label: ml, sessions: []};
        byMonth[mk].sessions.push(s);
      });
      const sortedMonths = Object.keys(byMonth).sort((a,b) => b - a);
      return `<div class="day-group">
        <div class="group-header">
          <span class="group-label">🗓 ${label}</span>
          <span class="group-total">${fmtHM(yearNet)}</span>
        </div>
        ${sortedMonths.map(mk => {
          const {label: ml, sessions: ms} = byMonth[mk];
          const monthNet = ms.reduce((a,s) => a+s.net, 0);
          // sub-group by day
          const byDay = {};
          ms.forEach(s => { if (!byDay[s.date]) byDay[s.date] = []; byDay[s.date].push(s); });
          const sortedDays = Object.keys(byDay).sort((a,b) => byDay[b][0].start - byDay[a][0].start);
          return `<div class="day-subheader">
            <span class="day-sublabel" style="text-transform:capitalize">${ml}</span>
            <span class="day-subtotal">${fmtHM(monthNet)}</span>
          </div>
          ${sortedDays.map(date => {
            const ds = byDay[date];
            const dayNet = ds.reduce((a,s) => a+s.net, 0);
            return `<div style="margin-left:8px">
              <div class="day-subheader" style="margin-top:6px;cursor:pointer" onclick="openDayEditor('${date}')" title="Toucher pour corriger la journée">
                <span class="day-sublabel" style="font-size:12px;color:var(--muted)">${date} ✏️</span>
                <span class="day-subtotal" style="font-size:12px">${fmtHM(dayNet)}</span>
              </div>
              ${ds.map(sessionItemHtml).join('')}
            </div>`;
          }).join('')}`;
        }).join('')}
      </div>`;
    }).join('');

  } else if (currentView === 'month') {
    const byMonth = {};
    state.sessions.forEach(s => {
      const d = new Date(s.start);
      const mk = d.getFullYear() * 100 + d.getMonth();
      const ml = d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
      if (!byMonth[mk]) byMonth[mk] = {label: ml, sessions: [], year: d.getFullYear(), month: d.getMonth()};
      byMonth[mk].sessions.push(s);
    });
    const sortedMonths = Object.keys(byMonth).sort((a,b) => b - a);
    list.innerHTML = sortedMonths.map(mk => {
      const {label: ml, sessions, year, month} = byMonth[mk];
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 1);
      // RTT comptée comme temps de travail effectif dans le total mensuel affiché.
      const monthRTTMs = getRTTGoalMsForRange(monthStart, monthEnd);
      const monthNet = sessions.reduce((a,s) => a+s.net, 0) + monthRTTMs;
      const monthGoal = getMonthGoal(year, month);
      const diff = monthNet - monthGoal;
      const diffColor = diff >= 0 ? 'var(--green)' : 'var(--accent2)';
      const diffSign = diff >= 0 ? '+' : '-';
      const monthPct = monthGoal > 0 ? Math.min(100, Math.round((monthNet / monthGoal) * 100)) : 0;
      const monthBarClass = monthPct >= 100 ? 'done' : monthPct >= 75 ? 'warning' : 'progress';
      const rttBadge = monthRTTMs > 0 ? ` <span style="color:var(--green);font-weight:600;font-size:11px;">(dont ${fmtHM(monthRTTMs)} RTT)</span>` : '';

      const byWeek = {};
      sessions.forEach(s => {
        const {key, label} = getWeekKey(s.start);
        if (!byWeek[key]) byWeek[key] = {label, sessions: []};
        byWeek[key].sessions.push(s);
      });
      const sortedWeeks = Object.keys(byWeek).sort((a,b) => b - a);

      return `<div class="day-group">
        <div class="group-header">
          <span class="group-label" style="text-transform:capitalize">🗓 ${ml}</span>
          <span class="group-total">${fmtHM(monthNet)}${rttBadge}</span>
        </div>
        <div class="objectif-bar-bg" style="margin:2px 0 6px 0;">
          <div class="objectif-bar-fill ${monthBarClass}" style="width:${monthPct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);margin:-2px 0 4px 0;">
          <span>Objectif: ${fmtHM(monthGoal)} (${monthPct}%)</span>
          <span style="color:${diffColor};font-weight:700">${diffSign}${fmtHM(Math.abs(diff))} h.sup</span>
        </div>
        ${remuneration.enabled && remuneration.tauxHoraire ? (() => {
          const primesM = getPrimesForMonth(year, month);
          const totalM = calcGainsMois(year, month) + primesM;
          const primesLabel = primesM > 0 ? ` <span style="color:var(--accent2);font-weight:600;">(+${fmtEuros(primesM)} primes)</span>` : '';
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--accent);margin:0 0 10px 0;font-weight:700;">
          <span>Gains du mois</span>
          <span>${fmtEuros(totalM)}${primesLabel}${remuneration.netEnabled ? ` (net: ${fmtEuros(calcNet(totalM))})` : ''}</span>
        </div>`;
        })() : ''}
        ${sortedWeeks.map(wk => {
          const {label: wl, sessions: ws} = byWeek[wk];
          const weekNet = ws.reduce((a,s) => a+s.net, 0);
          const byDay = {};
          ws.forEach(s => { if (!byDay[s.date]) byDay[s.date] = []; byDay[s.date].push(s); });
          const sortedDays = Object.keys(byDay).sort((a,b) => byDay[b][0].start - byDay[a][0].start);
          return `<div style="margin-left:8px">
            <div class="day-subheader" style="margin-top:6px">
              <span class="day-sublabel">📅 ${wl}</span>
              <span class="day-subtotal">${fmtHM(weekNet)}</span>
            </div>
            ${sortedDays.map(date => {
              const ds = byDay[date];
              const dayNet = ds.reduce((a,s) => a+s.net, 0);
              return `<div style="margin-left:8px">
                <div class="day-subheader" style="margin-top:4px">
                  <span class="day-sublabel" style="font-size:12px;color:var(--border)">${date}</span>
                  <span class="day-subtotal" style="font-size:12px">${fmtHM(dayNet)}</span>
                </div>
                ${ds.map(sessionItemHtml).join('')}
              </div>`;
            }).join('')}
          </div>`;
        }).join('')}
      </div>`;
    }).join('');
  }
}

