// ── UI ──
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const tabs = ['today','history','conges','reglages'];
  const tabEl = document.querySelectorAll('.tab')[tabs.indexOf(name)];
  if (tabEl) tabEl.classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'today') renderObjectifs();
  if (name === 'history') { renderHistory(); renderTrendChart(); renderTrendInsights(); renderComparisonChart(); renderPauseStatsGrid(); renderMultiYearChart(); renderHeatmap(); }
  if (name === 'conges') renderConges();
  if (name === 'reglages') renderReglages();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function updateHeaderDate() {
  const d = new Date();
  document.getElementById('headerDate').textContent =
    d.toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function updateHeaderTime() {
  const d = new Date();
  document.getElementById('headerTime').textContent =
    d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  // Garde le badge de l'icône à jour même sans session active (ex: après minuit)
  if (state.status === 'idle') {
    const today = todayKey();
    const dayTotal = state.sessions.filter(s => s.date === today).reduce((a, s) => a + s.net, 0);
    updateAppBadge(dayTotal);
  }
}

  function openBackupSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-backup-settings').classList.add('active');
    renderBackupSettings();
    renderVersionHistory();
  }

  
  const VERSION_HISTORY_KEY = 'orvia_version_history';
  const VERSION_HISTORY_MAX = 20;

  function getVersionHistory() {
    try {
      const raw = localStorage.getItem(VERSION_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveVersionHistory(list) {
    try {
      localStorage.setItem(VERSION_HISTORY_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function createVersionSnapshot(label) {
    const history = getVersionHistory();
    const data = buildBackupData();
    const snapshot = {
      ts: Date.now(),
      label: label || 'Sauvegarde',
      sessionsCount: (data.sessions || []).length,
      congesCount: (data.conges || []).length,
      data: data
    };
    history.unshift(snapshot);
    while (history.length > VERSION_HISTORY_MAX) history.pop();
    saveVersionHistory(history);
    return snapshot;
  }

  function deleteVersionSnapshot(ts) {
    const history = getVersionHistory().filter(s => s.ts !== ts);
    saveVersionHistory(history);
    renderVersionHistory();
  }

  function restoreVersionSnapshot(ts) {
    const history = getVersionHistory();
    const snapshot = history.find(s => s.ts === ts);
    if (!snapshot) return;
    const dateStr = new Date(snapshot.ts).toLocaleString('fr-FR');
    const ok = confirm(`Restaurer l'état du ${dateStr} ?\n\nCela remplacera les données actuelles (${(state.sessions||[]).length} sessions) par celles de cette sauvegarde (${snapshot.sessionsCount} sessions).`);
    if (!ok) return;
    createVersionSnapshot('Avant restauration automatique');
    const clean = sanitizeBackupData(snapshot.data);
    state.sessions = clean.sessions;
    state.conges = clean.conges;
    state.quotas = clean.quotas;
    objectifs = clean.objectifs;
    applyCleanCongeTypes(clean);
    save();
    saveConges();
    saveObjectifs();
    renderToday();
    renderHistory();
    renderConges();
    renderVersionHistory();
    switchTab('today');
    showToast('Version restaurée');
  }

  function manualVersionSnapshot() {
    createVersionSnapshot('Point de restauration manuel');
    renderVersionHistory();
    showToast('Point de restauration créé');
  }

  function renderVersionHistory() {
    const el = document.getElementById('versionHistoryList');
    if (!el) return;
    const history = getVersionHistory();
    if (!history.length) {
      el.innerHTML = '<div class="settings-summary" style="padding:8px 16px;">Aucun point de restauration pour le moment</div>';
      return;
    }
    el.innerHTML = history.map(s => {
      const dateStr = new Date(s.ts).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="settings-row">
          <div>
            <label style="display:block;">${dateStr}</label>
            <div class="settings-summary">${s.label} · ${s.sessionsCount} session(s), ${s.congesCount} congé(s)</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="restoreVersionSnapshot(${s.ts})" style="background:var(--accent);color:#fff;border:none;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">Restaurer</button>
            <button onclick="deleteVersionSnapshot(${s.ts})" style="background:transparent;color:var(--accent2);border:1px solid var(--accent2);padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">Suppr.</button>
          </div>
        </div>
      `;
    }).join('');
  }

function buildBackupData() {
    return { version: APP_VERSION, sessions: state.sessions, conges: state.conges, quotas: state.quotas, objectifs: objectifs, primesHistory: primesHistory, tauxHoraireHistory: tauxHoraireHistory, customCongeTypes: customCongeTypes, congeLabels: CONGE_LABELS, tombstones: loadTombstones(), savedAt: getLocalSavedAt() };
  }

  function performBackupDownload(filenameSuffix) {
    const data = buildBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timetracker_backup${filenameSuffix ? '_' + filenameSuffix : ''}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    performBackupDownload();
    createVersionSnapshot('Export manuel');
    showToast('Sauvegarde exportée');
  }

  const AUTO_BACKUP_WEEKDAYS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  function getAutoBackupSettings() {
    try {
      const raw = localStorage.getItem('orvia_autobackup_settings');
      if (!raw) return { enabled: true, weekday: 0 };
      const parsed = JSON.parse(raw);
      const enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : true;
      const weekday = Number.isInteger(parsed.weekday) && parsed.weekday >= 0 && parsed.weekday <= 6 ? parsed.weekday : 0;
      return { enabled, weekday };
    } catch (e) {
      return { enabled: true, weekday: 0 };
    }
  }

  function saveAutoBackupSettings(s) {
    localStorage.setItem('orvia_autobackup_settings', JSON.stringify(s));
  }

  function getLastAutoBackupDate() {
    return localStorage.getItem('orvia_last_auto_backup') || null;
  }

  function setLastAutoBackupDate(dateStr) {
    localStorage.setItem('orvia_last_auto_backup', dateStr);
  }

  function getPendingAutoBackupDate() {
    return localStorage.getItem('orvia_autobackup_pending') || null;
  }

  function setPendingAutoBackupDate(dateStr) {
    if (dateStr) localStorage.setItem('orvia_autobackup_pending', dateStr);
    else localStorage.removeItem('orvia_autobackup_pending');
  }

  // iOS (et les navigateurs mobiles en général) bloquent silencieusement les
  // téléchargements de fichiers déclenchés par du code sans geste utilisateur direct.
  // On ne télécharge donc plus jamais automatiquement : on repère juste qu'une
  // sauvegarde est due, et on demande à l'utilisateur de confirmer par un vrai tap
  // (voir confirmAutoBackup / renderBackupSettings), seul moyen fiable de garantir
  // que le fichier est réellement enregistré.
  function checkAutoBackup() {
    const settings = getAutoBackupSettings();
    if (!settings.enabled) return;
    const now = new Date();
    if (now.getDay() !== settings.weekday) return;
    const todayStr = toLocalISO(now);
    if (getLastAutoBackupDate() === todayStr) return;
    if (getPendingAutoBackupDate() === todayStr) return;
    setPendingAutoBackupDate(todayStr);
    showToast('💾 Sauvegarde automatique disponible dans Réglages > Sauvegarde');
  }

  function confirmAutoBackup() {
    const todayStr = getPendingAutoBackupDate() || toLocalISO(new Date());
    performBackupDownload(todayStr);
    createVersionSnapshot('Sauvegarde automatique');
    setLastAutoBackupDate(todayStr);
    setPendingAutoBackupDate(null);
    renderBackupSettings();
    showToast('💾 Sauvegarde automatique effectuée');
  }

  function toggleAutoBackup(enabled) {
    const settings = getAutoBackupSettings();
    settings.enabled = !!enabled;
    saveAutoBackupSettings(settings);
    renderBackupSettings();
  }

  function setAutoBackupWeekday(weekday) {
    const settings = getAutoBackupSettings();
    settings.weekday = clampNumber(weekday, 0, 6, 0);
    saveAutoBackupSettings(settings);
    renderBackupSettings();
  }

  function renderBackupSettings() {
    const settings = getAutoBackupSettings();
    const el = document.getElementById('autoBackupSettingsCard');
    if (!el) return;
    const lastDate = getLastAutoBackupDate();
    const pendingDate = getPendingAutoBackupDate();
    const pendingHtml = pendingDate ? `
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;">
        <div style="font-size:12px;color:var(--accent);font-weight:700;">💾 Sauvegarde automatique disponible</div>
        <button onclick="confirmAutoBackup()" style="background:var(--accent);color:#fff;border:none;padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Télécharger maintenant</button>
      </div>
    ` : '';
    el.innerHTML = `
      ${pendingHtml}
      <div class="settings-row">
        <label>Sauvegarde automatique</label>
        <label class="switch">
          <input type="checkbox" ${settings.enabled ? 'checked' : ''} onchange="toggleAutoBackup(this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <label>Jour de sauvegarde</label>
        <select onchange="setAutoBackupWeekday(Number(this.value))" ${settings.enabled ? '' : 'disabled'}>
          ${AUTO_BACKUP_WEEKDAYS.map((d, i) => `<option value="${i}" ${i === settings.weekday ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="settings-summary" style="padding:8px 16px 12px;font-size:11px;">
        ${lastDate ? 'Dernière sauvegarde auto : ' + lastDate : 'Aucune sauvegarde automatique effectuée encore'}
      </div>
    `;
  }

  
function clampNumber(n, min, max, fallback) {
  n = Number(n);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeGeo(g) {
  if (!g || typeof g !== 'object') return null;
  const lat = Number(g.lat), lng = Number(g.lng);
  const label = typeof g.label === 'string' ? g.label.slice(0, 120) : '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: label || `${lat}, ${lng}` };
}

function normalizeSession(s) {
  if (!s || typeof s !== 'object') return null;
  const start = Number(s.start), end = Number(s.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const pauseMs = clampNumber(s.pauseMs || 0, 0, end - start, 0);
  const maxNet = end - start - pauseMs;
  const netRaw = Number(s.net);
  const net = Number.isFinite(netRaw) ? Math.max(0, Math.min(netRaw, maxNet)) : maxNet;
  const date = typeof s.date === 'string' && s.date.trim() ? s.date : tsToKey(start);
  return {
    date,
    start,
    end,
    pauseMs,
    net,
    note: typeof s.note === 'string' ? s.note.slice(0, 120) : '',
    startGeo: normalizeGeo(s.startGeo),
    endGeo: normalizeGeo(s.endGeo),
    workMode: (s.workMode === 'presentiel' || s.workMode === 'teletravail') ? s.workMode : null
  };
}

function workdaysBetweenSafe(startVal, endVal) {
  let cur = new Date(startVal + 'T00:00:00');
  const end = new Date(endVal + 'T00:00:00');
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return 0;
  let days = 0;
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6 && !isDateHoliday(toLocalISO(cur))) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function normalizeConge(c, extraTypeIds) {
  if (!c || typeof c !== 'object') return null;
  const allowed = ['cp','rtt', ...(Array.isArray(extraTypeIds) ? extraTypeIds : customCongeTypes.map(t => t.id))];
  const type = allowed.includes(c.type) ? c.type : null;
  const start = typeof c.start === 'string' ? c.start : '';
  const end = typeof c.end === 'string' && c.end ? c.end : start;
  if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  return {
    type,
    start,
    end,
    note: typeof c.note === 'string' ? c.note.slice(0, 120) : '',
    days: workdaysBetweenSafe(start, end),
    id: Number.isFinite(Number(c.id)) ? Number(c.id) : Date.now() + Math.floor(Math.random()*100000)
  };
}

function normalizeQuotas(q, extraTypeIds) {
  const base = { cp:25, rtt:10 };
  if (!q || typeof q !== 'object') return base;
  const out = {
    cp: clampNumber(q.cp, 0, 365, base.cp),
    rtt: clampNumber(q.rtt, 0, 365, base.rtt),
  };
  (extraTypeIds || []).forEach(id => { if (q[id] !== undefined) out[id] = clampNumber(q[id], 0, 365, 0); });
  return out;
}

function normalizeCustomCongeTypes(arr) {
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  return arr.filter(t => t && typeof t === 'object' && typeof t.id === 'string' && /^[\w-]{1,40}$/.test(t.id) && t.id !== 'cp' && t.id !== 'rtt' && !seen.has(t.id) && seen.add(t.id))
    .map(t => ({ id: t.id, label: String(t.label || t.id).slice(0, 40), color: /^#[0-9a-fA-F]{3,8}$/.test(String(t.color)) ? t.color : '#6c63ff' }));
}

function applyCleanCongeTypes(clean) {
  if (!clean || !clean.customCongeTypes) return;
  customCongeTypes = clean.customCongeTypes;
  if (clean.congeLabels) Object.assign(CONGE_LABELS, clean.congeLabels);
}

function normalizeObjectifs(o) {
  const defaults = { jour: 8*3600000, semaine: 35*3600000, parJour: {1:8*3600000,2:8*3600000,3:8*3600000,4:8*3600000,5:8*3600000,6:0,0:0} };
  if (!o || typeof o !== 'object') return defaults;
  const parJour = Object.assign({}, defaults.parJour);
  if (o.parJour && typeof o.parJour === 'object') {
    [0,1,2,3,4,5,6].forEach(d => { parJour[d] = clampNumber(o.parJour[d], 0, 24*3600000, defaults.parJour[d]); });
  }
  return {
    jour: clampNumber(o.jour, 0, 24*3600000, defaults.jour),
    semaine: clampNumber(o.semaine, 0, 7*24*3600000, defaults.semaine),
    parJour
  };
}

function normalizePrimeEntry(e) {
  if (!e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Number(e.montant))) return null;
  return {
    id: Number.isFinite(e.id) ? e.id : (Date.now() + Math.floor(Math.random() * 100000)),
    date: e.date,
    montant: clampNumber(Number(e.montant), 0, 1000000, 0),
    type: PRIME_TYPES.some(t => t.id === e.type) ? e.type : 'autre',
    note: typeof e.note === 'string' ? e.note.slice(0, 60) : ''
  };
}

function normalizeTauxEntry(e) {
  if (!e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Number(e.taux))) return null;
  return {
    id: Number.isFinite(e.id) ? e.id : (Date.now() + Math.floor(Math.random() * 100000)),
    date: e.date,
    taux: clampNumber(Number(e.taux), 0, 1000, 0),
    note: typeof e.note === 'string' ? e.note.slice(0, 60) : ''
  };
}

function sanitizeBackupData(data) {
  if (!data || typeof data !== 'object') throw new Error('invalid_json');
  if (!Array.isArray(data.sessions) || !Array.isArray(data.conges)) throw new Error('invalid_structure');
  const sessions = data.sessions.map(normalizeSession).filter(Boolean).sort((a,b) => a.start - b.start);
  const _customTypes = normalizeCustomCongeTypes(data.customCongeTypes);
  const _typeIds = (_customTypes || customCongeTypes).map(t => t.id);
  const conges = data.conges.map(c => normalizeConge(c, _typeIds)).filter(Boolean).sort((a,b) => a.start.localeCompare(b.start));
  const quotas = normalizeQuotas(data.quotas, _typeIds);
  const _labels = {};
  if (data.congeLabels && typeof data.congeLabels === 'object') {
    ['cp','rtt', ..._typeIds].forEach(id => { if (typeof data.congeLabels[id] === 'string') _labels[id] = data.congeLabels[id].slice(0, 40); });
  }
  const objectifsNorm = normalizeObjectifs(data.objectifs);
  // Compatibilité ascendante : une sauvegarde/un backup cloud plus ancien
  // n'a pas ces deux champs — dans ce cas on conserve l'historique local
  // actuel plutôt que de le vider silencieusement.
  const primesHist = Array.isArray(data.primesHistory)
    ? data.primesHistory.map(normalizePrimeEntry).filter(Boolean).sort((a,b) => b.date.localeCompare(a.date))
    : primesHistory.slice();
  const tauxHist = Array.isArray(data.tauxHoraireHistory)
    ? data.tauxHoraireHistory.map(normalizeTauxEntry).filter(Boolean).sort((a,b) => a.date.localeCompare(b.date))
    : tauxHoraireHistory.slice();
  return {
    sessions,
    conges,
    quotas,
    customCongeTypes: _customTypes,
    congeLabels: _labels,
    tombstones: normalizeTombstones(data.tombstones),
    savedAt: Number(data.savedAt) || 0,
    objectifs: objectifsNorm,
    primesHistory: primesHist,
    tauxHoraireHistory: tauxHist,
    droppedSessions: data.sessions.length - sessions.length,
    droppedConges: data.conges.length - conges.length
  };
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const raw = JSON.parse(e.target.result);
        const clean = sanitizeBackupData(raw);
        if (!clean.sessions.length && !clean.conges.length) {
          const proceedEmpty = confirm('La sauvegarde est valide mais ne contient aucune donnée exploitable. Continuer quand même ?');
          if (!proceedEmpty) return;
        }
        let msg = 'Importer la sauvegarde ?';
        if (clean.droppedSessions || clean.droppedConges) {
          msg += `\n\nNettoyage détecté : ${clean.droppedSessions} session(s) et ${clean.droppedConges} congé(s) ignoré(s) car invalides.`;
        }
        const ok = confirm(msg);
        if (!ok) return;
        state.sessions = clean.sessions;
        state.conges = clean.conges;
        state.quotas = clean.quotas;
        objectifs = clean.objectifs;
        primesHistory = clean.primesHistory;
        tauxHoraireHistory = clean.tauxHoraireHistory;
        applyCleanCongeTypes(clean);
        save();
        saveConges();
        saveObjectifs();
        savePrimesHistory();
        saveTauxHoraireHistory();
        renderToday();
        renderHistory();
        renderConges();
        renderPrimesHistoList();
        renderTauxHoraireHistoList();
        switchTab('today');
        if (clean.droppedSessions || clean.droppedConges) {
          showToast(`Import partiel : ${clean.droppedSessions} session(s), ${clean.droppedConges} congé(s) ignoré(s)`);
        } else {
          showToast('Sauvegarde importée');
        }
      } catch(err) {
        const map = {
          invalid_json: 'Fichier invalide',
          invalid_structure: 'Structure de sauvegarde invalide'
        };
        showToast(map[err.message] || 'Erreur de lecture');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  window.addEventListener('online', onNetworkOnline);
  window.addEventListener('offline', onNetworkOffline);

  let swReady = false;
  let swRefreshing = false;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        swReady = true;
        console.log('[SW] Enregistré avec succès', reg.scope);
        reg.update();
        setInterval(() => reg.update(), 3600000);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ action: 'skipWaiting' });
            }
          });
        });
      }).catch((err) => {
        swReady = false;
        console.warn('[SW] Échec de l\'enregistrement:', err.message);
        showToast('Mode hors-ligne indisponible sur cet appareil');
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
      });
    });

// (listeners online/offline déjà attachés globalement plus haut)
  } else {
    console.warn('[SW] Service worker non supporté par ce navigateur');
  }

// ── INIT ──
applyTheme(getCurrentThemeId());
applyMode(getCurrentMode());
initSeasonalTheme();
load();
loadConges(); checkLowQuotaAlerts(); checkCongeExpiryNotification(); checkBTP5eSemaineNotification(); loadAuditLog();
renderSyncStatusBadge();
processSyncQueue();
loadObjectifs();
loadRemuneration();
loadTauxHoraireHistory();
loadPrimesHistory();
loadArrondi();
if (getGeofenceConfig().enabled) startGeofenceWatch();
loadInactivite();
loadResumeJour();
requestNotifPermission();
updateHeaderDate();
updateHeaderTime();
setInterval(updateHeaderTime, 1000);
setInterval(checkReminderTrigger, 60000);
checkReminderTrigger();
setInterval(checkForgottenSession, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkForgottenSession(); autoSyncOnOpen(); } });
checkForgottenSession();
checkAutoBackup();
if (!localStorage.getItem(SYNC_KEYS_KEY)) { try { rememberSyncKeys(); } catch (e) {} }
refreshCloudUser().then(() => { renderSyncStatusBadge(); autoSyncOnOpen(); if (_cloudUser) subscribeToCloudChanges(); });
setInterval(autoSyncOnOpen, 30 * 60000);
initCompactMode();
checkWorkAnniversary();
checkTaxThresholdProximity();

// ── ACTION RAPIDE VIA URL (raccourci iOS "Raccourcis"/Siri) ──
// Ouvrir l'app avec ?action=start ou ?action=stop déclenche l'action
// immédiatement, sans avoir à naviguer dans l'interface.
(function handleQuickAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (!action) return;
  // Nettoie l'URL pour ne pas redéclencher l'action à un futur rechargement.
  history.replaceState(null, '', window.location.pathname);
  const nowLabel = () => new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  if (action === 'start' && state.status === 'idle') {
    handleMainBtn();
    notifyShortcutActionResult(`Session démarrée à ${nowLabel()} ✓`);
  } else if (action === 'stop' && state.status !== 'idle') {
    stopSession();
    notifyShortcutActionResult(`Session terminée à ${nowLabel()} ✓`);
  } else if (action === 'pause' && state.status === 'running') {
    handleMainBtn();
    notifyShortcutActionResult(`Pause démarrée à ${nowLabel()} ⏸️`);
  } else if (action === 'pause' && state.status === 'paused') {
    // Le raccourci "Pause" bascule aussi la reprise si une pause est déjà en cours.
    handleMainBtn();
    notifyShortcutActionResult(`Reprise du travail à ${nowLabel()} ▶️`);
  }
})();

// Bloque le pincement pour zoomer, certaines versions de Safari iOS
// ignorent user-scalable=no dans la balise viewport.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
setInterval(checkAutoBackup, 3600000);
updateButtons();
renderToday();
const _vbtInit = document.getElementById('versionBadgeTop');
if (_vbtInit) _vbtInit.textContent = 'v' + APP_VERSION;

if (state.status !== 'idle') {
  startTimer();
  document.getElementById('startTimeDisplay').textContent = fmtTime(state.startTs);
  document.getElementById('elapsedLabel').textContent = state.status === 'paused' ? 'En pause…' : 'En cours…';
}

setTimeout(() => { maybeShowYesterdaySummary();     maybeShowWeeklyReport(); }, 400);
