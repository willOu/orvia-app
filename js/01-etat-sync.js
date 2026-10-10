// ── STATE ──
let state = {
  status: 'idle',
  startTs: null,
  pauseStart: null,
  totalPauseMs: 0,
  startGeo: null,
  workMode: null,
  sessions: [],
  conges: [],
  quotas: { cp:25, rtt:10 },
};

let objectifs = {
  jour: 8 * 3600000,
  semaine: 35 * 3600000,
  parJour: { 1: 8*3600000, 2: 8*3600000, 3: 8*3600000, 4: 8*3600000, 5: 8*3600000, 6: 0, 0: 0 } // 0=dimanche...6=samedi
}; // ms


let timerInterval = null;
function onNoteInputChange(){
  const val=document.getElementById('noteInput').value;
  localStorage.setItem('orvia_note_en_cours',val);
}
function maybeShowWeeklyReport() {
  const now = new Date();
  if (now.getDay() !== 1 && now.getDay() !== 5) return;
  const todayKey_ = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  const lastShown = localStorage.getItem('orvia_weekly_report_shown');
  if (lastShown === todayKey_) return;
  localStorage.setItem('orvia_weekly_report_shown', todayKey_);
  let periodStart, periodEnd;
  if (now.getDay() === 1) {
    periodStart = new Date(now); periodStart.setDate(now.getDate() - 7); periodStart.setHours(0,0,0,0);
    periodEnd = new Date(now); periodEnd.setDate(now.getDate() - 1); periodEnd.setHours(23,59,59,999);
  } else {
    periodStart = getMondayOf(now); periodStart.setHours(0,0,0,0);
    periodEnd = new Date(now); periodEnd.setHours(23,59,59,999);
  }
  const sessions = state.sessions.filter(s => { const d = new Date(s.start); return d >= periodStart && d <= periodEnd; });
  if (sessions.length === 0) return;
  const totalMs = sessions.reduce((a,s) => a+s.net, 0);
  const totalH = Math.floor(totalMs/3600000);
  const totalM = Math.floor((totalMs%3600000)/60000);
  const joursActifs = new Set(sessions.map(s=>tsToKey(s.start))).size;
  const goalMs = objectifs.semaine || 35*3600000;
  const pct = Math.min(100, Math.round(totalMs/goalMs*100));
  const emoji = pct>=100 ? '🎉' : pct>=75 ? '👍' : '💪';
  const capCfg = getWeeklyLegalCapConfig();
  const capExceeded = capCfg.enabled && totalMs >= capCfg.capHours*3600000;
  const dailyRules = getDailyRules();
  const overCapDays = dailyRules.daily ? [...new Set(sessions.map(s=>s.date))].filter(d => dayTotal(d) >= 10*3600000) : [];
  const restViol = dailyRules.rest ? restViolations().filter(v => v.b.start >= periodStart.getTime() && v.b.start <= periodEnd.getTime()) : [];
  const totalPauseMs = sessions.reduce((a,s) => a + (s.pauseMs||0), 0);
  const avgPauseMs = sessions.length ? Math.round(totalPauseMs / joursActifs) : 0;
  const alertsHtml = [
    capExceeded ? `<div style="font-size:12px;color:var(--accent2);font-weight:700;margin-top:4px;">⚠️ Plafond légal hebdomadaire dépassé (${capCfg.capHours}h)</div>` : '',
    overCapDays.length ? `<div style="font-size:12px;color:var(--orange);font-weight:700;margin-top:4px;">⚠️ ${overCapDays.length} jour${overCapDays.length>1?'s':''} au-delà de 10h</div>` : '',
    restViol.length ? `<div style="font-size:12px;color:var(--orange);font-weight:700;margin-top:4px;">⚠️ ${restViol.length} repos inférieur${restViol.length>1?'s':''} à 11h entre deux journées</div>` : ''
  ].filter(Boolean).join('');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'weeklyReportModal';
  modal.innerHTML = `<div class="modal-box"><div class="modal-title">${emoji} Bilan ${now.getDay()===1?'de la semaine dernière':'de la semaine'}</div><div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Du ${periodStart.toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})} au ${periodEnd.toLocaleDateString('fr-FR',{day:'2-digit',month:'long'})}</div><div class="objectif-card"><div class="objectif-header"><span class="objectif-label">Total</span><span class="objectif-values" style="color:var(--${pct>=100?'green':'accent'})">${totalH}h${String(totalM).padStart(2,'0')} / ${Math.floor(goalMs/3600000)}h</span></div><div class="objectif-bar-bg"><div class="objectif-bar-fill ${pct>=100?'done':'progress'}" style="width:${pct}%"></div></div></div><div style="font-size:13px;color:var(--muted);margin-top:12px;">${joursActifs} jour${joursActifs>1?'s':''} travaillé${joursActifs>1?'s':''} · ${sessions.length} session${sessions.length>1?'s':''} · pause moy. ${fmtHM(avgPauseMs)}</div>${alertsHtml}<div class="modal-actions"><button class="modal-btn-save" onclick="document.getElementById('weeklyReportModal').remove()">Fermer</button></div></div>`;
  document.body.appendChild(modal);
}

const APP_VERSION = '2.2.0';


// ── STORAGE ──
// ── NOTIFICATIONS VISUELLES D'ÉTAT DE SYNCHRONISATION ──
// Il n'y a pas encore de sauvegarde cloud réelle : ce système prépare le
// terrain (détection de connexion, file d'attente des changements locaux,
// badge visuel, historique) pour qu'une synchronisation future n'ait qu'à
// se brancher sur `enqueueSyncChange()` et `processSyncQueue()`.
const SYNC_QUEUE_KEY = 'orvia_sync_queue';
const SYNC_STATE_KEY = 'orvia_sync_state';
const SYNC_QUEUE_MAX = 200;

function getSyncQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function saveSyncQueue(q) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q.slice(-SYNC_QUEUE_MAX)));
}

function getSyncState() {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { lastSyncTs: p.lastSyncTs || null, cloudEnabled: p.cloudEnabled === true };
  } catch (e) { return { lastSyncTs: null, cloudEnabled: false }; }
}

function saveSyncState(s) {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(s));
}

// ── FUSION DE SYNCHRO ── (MERGE:BEGIN)
// Fusion session par session : au lieu de « le dernier qui écrit gagne » sur tout le
// bloc, on garde l'union des sessions (clé = heure de début) et des congés (clé = id).
// Les suppressions sont suivies par des « pierres tombales » pour ne pas ressusciter
// une donnée supprimée sur un autre appareil. Les réglages (quotas, objectifs,
// historiques) viennent de l'appareil modifié le plus récemment.
const SYNC_TOMB_KEY = 'orvia_sync_tombstones';
const SYNC_KEYS_KEY = 'orvia_sync_known_keys';
const SYNC_MT_KEY = 'orvia_local_saved_at';
const SYNC_SIG_KEY = 'orvia_sync_sig';
const TOMB_TTL_MS = 90 * 86400000;
let _syncSuppress = 0;

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function normalizeTombstones(t) {
  const out = { s: {}, c: {} };
  const limit = Date.now() - TOMB_TTL_MS;
  ['s', 'c'].forEach(k => {
    if (t && typeof t[k] === 'object' && t[k]) {
      Object.keys(t[k]).forEach(id => {
        const ts = Number(t[k][id]);
        if (Number.isFinite(ts) && ts > limit) out[k][id] = ts;
      });
    }
  });
  return out;
}

function loadTombstones() {
  try { return normalizeTombstones(JSON.parse(localStorage.getItem(SYNC_TOMB_KEY) || 'null')); }
  catch (e) { return { s: {}, c: {} }; }
}

function getLocalSavedAt() { try { return Number(localStorage.getItem(SYNC_MT_KEY)) || 0; } catch (e) { return 0; } }
function setLocalSavedAt(ts) { try { localStorage.setItem(SYNC_MT_KEY, String(ts)); } catch (e) {} }

function currentSyncKeys() {
  return { s: (state.sessions || []).map(x => String(x.start)), c: (state.conges || []).map(x => String(x.id)) };
}
function rememberSyncKeys() { try { localStorage.setItem(SYNC_KEYS_KEY, JSON.stringify(currentSyncKeys())); } catch (e) {} }

function syncSignature(b) {
  const ct = (b.customCongeTypes || []).slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const ids = ['cp', 'rtt'].concat(ct.map(t => t.id));
  const labels = {};
  ids.forEach(id => { if (b.congeLabels && typeof b.congeLabels[id] === 'string') labels[id] = b.congeLabels[id]; });
  return stableStringify({
    s: (b.sessions || []).slice().sort((x, y) => x.start - y.start),
    c: (b.conges || []).slice().sort((x, y) => String(x.id).localeCompare(String(y.id))),
    q: b.quotas, o: b.objectifs, p: b.primesHistory || [], t: b.tauxHoraireHistory || [], ct, l: labels
  });
}

// Appelé à chaque modification locale : enregistre les suppressions et
// n'avance l'horodatage local que si les données ont réellement changé.
function trackLocalChanges() {
  let prev = null;
  try { prev = JSON.parse(localStorage.getItem(SYNC_KEYS_KEY) || 'null'); } catch (e) {}
  const cur = currentSyncKeys();
  const tomb = loadTombstones();
  const now = Date.now();
  if (prev && Array.isArray(prev.s) && Array.isArray(prev.c)) {
    const curS = new Set(cur.s), curC = new Set(cur.c);
    prev.s.forEach(k => { if (!curS.has(k)) tomb.s[k] = now; });
    prev.c.forEach(k => { if (!curC.has(k)) tomb.c[k] = now; });
  }
  cur.s.forEach(k => { delete tomb.s[k]; });
  cur.c.forEach(k => { delete tomb.c[k]; });
  try { localStorage.setItem(SYNC_TOMB_KEY, JSON.stringify(tomb)); } catch (e) {}
  rememberSyncKeys();
  const sig = syncSignature(buildBackupData());
  if (sig !== localStorage.getItem(SYNC_SIG_KEY)) {
    try { localStorage.setItem(SYNC_SIG_KEY, sig); } catch (e) {}
    setLocalSavedAt(now);
  }
}

// Fusion pure (sans accès au DOM ni au stockage) : testable seule.
function mergeBackups(local, remote) {
  const lt = normalizeTombstones(local.tombstones), rt = normalizeTombstones(remote.tombstones);
  const tomb = { s: {}, c: {} };
  ['s', 'c'].forEach(k => {
    [lt[k], rt[k]].forEach(src => Object.keys(src).forEach(id => { tomb[k][id] = Math.max(tomb[k][id] || 0, src[id]); }));
  });
  const localNewer = (local.savedAt || 0) >= (remote.savedAt || 0);
  const newer = localNewer ? local : remote, older = localNewer ? remote : local;
  const union = (field, keyFn, tk) => {
    const m = new Map();
    [older, newer].forEach(src => (src[field] || []).forEach(it => {
      const k = String(keyFn(it));
      if (!tomb[tk][k]) m.set(k, it);
    }));
    return Array.from(m.values());
  };
  const types = new Map();
  [older, newer].forEach(src => (src.customCongeTypes || []).forEach(t => types.set(t.id, t)));
  return {
    version: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : (newer.version || ''),
    sessions: union('sessions', x => x.start, 's').sort((a, b) => a.start - b.start),
    conges: union('conges', x => x.id, 'c').sort((a, b) => a.start.localeCompare(b.start)),
    quotas: Object.assign({}, older.quotas, newer.quotas),
    objectifs: newer.objectifs || older.objectifs,
    primesHistory: newer.primesHistory || older.primesHistory || [],
    tauxHoraireHistory: newer.tauxHoraireHistory || older.tauxHoraireHistory || [],
    customCongeTypes: Array.from(types.values()),
    congeLabels: Object.assign({}, older.congeLabels, newer.congeLabels),
    tombstones: tomb,
    savedAt: Math.max(local.savedAt || 0, remote.savedAt || 0)
  };
}
// (MERGE:END)

function enqueueSyncChange(kind, summary, noTrack) {
  if (_syncSuppress > 0) return;
  if (!noTrack) { try { trackLocalChanges(); } catch (e) {} }
  const q = getSyncQueue();
  q.push({ id: Date.now() + Math.floor(Math.random() * 100000), ts: Date.now(), kind, summary: (summary || '').slice(0, 120) });
  saveSyncQueue(q);
  renderSyncStatusBadge();
  clearTimeout(window._syncDebounce);
  window._syncDebounce = setTimeout(processSyncQueue, 1200);
}

function getSyncPhase() {
  const online = navigator.onLine;
  const cfg = getSyncState();
  const queueLen = getSyncQueue().length;
  if (!cfg.cloudEnabled) return online ? 'offline-nocloud' : 'offline';
  if (!_cloudUser) return 'offline-nocloud';
  if (!online) return queueLen > 0 ? 'offline-pending' : 'offline';
  if (queueLen > 0) return 'syncing';
  return 'synced';
}

const SYNC_PHASE_META = {
  'synced':          { icon: '☁️', label: 'Synchronisé',       bg: 'rgba(62,207,142,.16)', color: '#3ecf8e' },
  'syncing':         { icon: '🔄', label: 'Synchronisation…',  bg: 'rgba(108,99,255,.16)', color: 'var(--accent)' },
  'offline-pending': { icon: '⏳', label: 'En attente',         bg: 'rgba(245,158,11,.16)', color: 'var(--orange)' },
  'offline':         { icon: '📴', label: 'Hors ligne',         bg: 'rgba(139,143,168,.16)', color: 'var(--muted)' },
  'offline-nocloud':{ icon: '💾', label: 'Stockage local',     bg: 'rgba(139,143,168,.16)', color: 'var(--muted)' }
};

let _lastSyncPhase = null;

function renderSyncStatusBadge() {
  const el = document.getElementById('syncStatusBadge');
  if (!el) return;
  const phase = getSyncPhase();
  const meta = SYNC_PHASE_META[phase];
  el.style.background = meta.bg;
  el.style.color = meta.color;
  const queueLen = getSyncQueue().length;
  const countBadge = (phase === 'offline-pending' || phase === 'syncing') && queueLen > 0
    ? `<span style="background:${meta.color};color:#fff;border-radius:999px;font-size:9px;padding:1px 5px;">${queueLen}</span>` : '';
  el.innerHTML = `<span${phase === 'syncing' ? ' style="display:inline-block;animation:orviaSyncSpin 1.2s linear infinite;"' : ''}>${meta.icon}</span><span>${meta.label}</span>${countBadge}`;

  if (_lastSyncPhase !== null && _lastSyncPhase !== phase) {
    notifySyncPhaseChange(_lastSyncPhase, phase);
  }
  _lastSyncPhase = phase;
}

let _lastSyncToastTs = 0;
const SYNC_TOAST_MIN_INTERVAL = 30000;

function notifySyncPhaseChange(fromPhase, toPhase) {
  const now = Date.now();
  if (now - _lastSyncToastTs < SYNC_TOAST_MIN_INTERVAL) return;
  let shown = true;
  if (toPhase === 'offline' && fromPhase !== 'offline-pending') {
    showToast('📴 Connexion perdue — mode hors ligne');
  } else if (toPhase === 'offline-pending') {
    showToast('⏳ Hors ligne — modifications mises en attente');
  } else if (toPhase === 'syncing') {
    showToast('🔄 Connexion rétablie — synchronisation…');
  } else if (toPhase === 'synced' && (fromPhase === 'syncing' || fromPhase === 'offline-pending')) {
    showToast('☁️ Toutes les modifications sont synchronisées ✓');
  } else {
    shown = false;
  }
  if (shown) _lastSyncToastTs = now;
}

let _syncRunning = false;
async function processSyncQueue() {
  const cfg = getSyncState();
  if (!cfg.cloudEnabled || !navigator.onLine || !_cloudUser) return;
  const q = getSyncQueue();
  if (!q.length || _syncRunning) return;
  _syncRunning = true;
  const sentIds = new Set(q.map(i => i.id));
  let ok = false;
  try { ok = await pushToCloud(); } finally { _syncRunning = false; }
  if (ok) {
    // On ne retire que ce qui a été envoyé : ce qui a été modifié pendant l'envoi reste en file.
    saveSyncQueue(getSyncQueue().filter(i => !sentIds.has(i.id)));
    saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
    if (getSyncQueue().length) setTimeout(processSyncQueue, 1500);
  }
  renderSyncStatusBadge();
}

function onNetworkOnline() {
  autoSyncOnOpen();
  if (_cloudUser) { unsubscribeFromCloudChanges(); subscribeToCloudChanges(); }
  renderSyncStatusBadge();
}

function onNetworkOffline() {
  renderSyncStatusBadge();
}

// ── SUPABASE (synchronisation cloud) ──
// L'anon key Supabase est publique par conception : la sécurité est assurée
// par les policies Row Level Security côté serveur (voir supabase_schema.sql),
// pas par le secret de cette clé. Elle peut donc être embarquée côté client.
const SUPABASE_URL = 'https://aazoafadntpgwzfgrgsx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhem9hZmFkbnRwZ3d6ZmdyZ3N4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTUxMTAsImV4cCI6MjA5OTk3MTExMH0.rd0-Bcg_WE-NbbeHWY82bCm56Y60rZiT8SBVqepFooc';

let sb = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { sb = null; }

let _cloudUser = null;

async function refreshCloudUser() {
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    _cloudUser = (data && data.session && data.session.user) ? data.session.user : null;
  } catch (e) { _cloudUser = null; }
  return _cloudUser;
}

let _pendingLoginEmail = null;

async function sendMagicLink(email) {
  if (!sb) { showToast('Client cloud indisponible'); return false; }
  const clean = (email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { showToast('Adresse email invalide'); return false; }
  const redirectTo = window.location.origin + window.location.pathname;
  try {
    // shouldCreateUser: true par défaut ; on garde emailRedirectTo pour que le lien
    // fonctionne aussi en secours, mais le flux principal est le code à 6 chiffres
    // (le lien seul ne suffit pas dans une PWA : Safari/Mail ont un stockage séparé
    // de celui de l'app installée sur l'écran d'accueil).
    const { error } = await sb.auth.signInWithOtp({ email: clean, options: { emailRedirectTo: redirectTo } });
    if (error) { showToast('Erreur : ' + error.message); return false; }
    _pendingLoginEmail = clean;
    showToast('📧 Code envoyé — vérifiez vos emails');
    return true;
  } catch (e) {
    showToast('Erreur réseau lors de l\'envoi du code');
    return false;
  }
}

async function verifyLoginCode(code) {
  if (!sb || !_pendingLoginEmail) { showToast('Redemandez un code'); return false; }
  const clean = (code || '').trim();
  if (!/^\d{6}$/.test(clean)) { showToast('Le code doit contenir 6 chiffres'); return false; }
  try {
    const { data, error } = await sb.auth.verifyOtp({ email: _pendingLoginEmail, token: clean, type: 'email' });
    if (error) { showToast('Code invalide ou expiré'); return false; }
    return true;
  } catch (e) {
    showToast('Erreur réseau lors de la vérification');
    return false;
  }
}

async function signOutCloud() {
  if (!sb) return;
  unsubscribeFromCloudChanges();
  try { await sb.auth.signOut(); } catch (e) {}
  _cloudUser = null;
  const cfg = getSyncState();
  saveSyncState({ ...cfg, cloudEnabled: false });
  renderSyncStatusBadge();
  showToast('Déconnecté du cloud');
}

// ── TEMPS RÉEL ──
// Écoute les changements de la ligne de l'utilisateur connecté : dès qu'un
// autre appareil pousse une mise à jour, on la récupère immédiatement, sans
// attendre le prochain sondage périodique.
let _realtimeChannel = null;

function subscribeToCloudChanges() {
  if (!sb || !_cloudUser || _realtimeChannel) return;
  try {
    _realtimeChannel = sb.channel('orvia_backups_' + _cloudUser.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orvia_backups',
        filter: 'user_id=eq.' + _cloudUser.id,
      }, (payload) => {
        handleRealtimeCloudChange(payload.new);
      })
      .subscribe();
  } catch (e) {
    _realtimeChannel = null;
  }
}

function unsubscribeFromCloudChanges() {
  if (_realtimeChannel && sb) {
    try { sb.removeChannel(_realtimeChannel); } catch (e) {}
  }
  _realtimeChannel = null;
}

function handleRealtimeCloudChange(row) {
  if (!row || !row.updated_at || !row.data) return;
  const remoteTs = new Date(row.updated_at).getTime();
  // Ignore l'écho de nos propres écritures (déjà appliquées localement).
  if (remoteTs <= (getSyncState().lastSyncTs || 0)) return;
  let rd;
  try { rd = sanitizeBackupData(row.data); } catch (e) { return; }
  rd.savedAt = rd.savedAt || remoteTs;
  const local = buildBackupData();
  const merged = mergeBackups(local, rd);
  const changedLocal = syncSignature(merged) !== syncSignature(local);
  if (changedLocal) {
    applyCleanBackup(merged, true);
    showToast('☁️ Données mises à jour depuis un autre appareil');
  }
  if (syncSignature(merged) !== syncSignature(rd)) {
    enqueueSyncChange('merge', 'Fusion avec un autre appareil', true);
  } else {
    saveSyncState({ ...getSyncState(), lastSyncTs: remoteTs });
  }
  renderSyncStatusBadge();
}

let _lastMergeApplied = false;
// Envoie les données au cloud en les fusionnant d'abord avec la version distante.
// opts.force : écrase le cloud sans fusion (choix explicite de l'utilisateur).
async function pushToCloud(opts) {
  if (!sb || !_cloudUser) return false;
  _lastMergeApplied = false;
  const force = !!(opts && opts.force);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = force ? null : await pullFromCloud();
      let payload = buildBackupData();
      if (remote && remote.data) {
        let remoteSane = null;
        try { remoteSane = sanitizeBackupData(remote.data); } catch (e) { remoteSane = null; }
        if (remoteSane) {
          remoteSane.savedAt = remoteSane.savedAt || new Date(remote.updated_at).getTime();
          const merged = mergeBackups(payload, remoteSane);
          if (syncSignature(merged) !== syncSignature(payload)) {
            applyCleanBackup(merged, true);
            _lastMergeApplied = true;
          }
          payload = merged;
          // Comparaison sur les formes normalisées, pour ne pas réécrire à l'identique en boucle.
          let mergedNorm = merged;
          try { mergedNorm = sanitizeBackupData(merged); } catch (e) {}
          if (syncSignature(mergedNorm) === syncSignature(remoteSane)
              && stableStringify(merged.tombstones) === stableStringify(remoteSane.tombstones)) {
            return true; // le cloud est déjà à jour : rien à envoyer
          }
        }
      }
      const now = new Date().toISOString();
      if (remote && !force && attempt < 2) {
        // Écriture conditionnelle : n'aboutit que si personne n'a écrit entre-temps.
        const { data, error } = await sb.from('orvia_backups')
          .update({ data: payload, updated_at: now })
          .eq('user_id', _cloudUser.id)
          .eq('updated_at', remote.updated_at)
          .select('user_id');
        if (error) return false;
        if (data && data.length) return true;
      } else {
        const { error } = await sb.from('orvia_backups').upsert({ user_id: _cloudUser.id, data: payload, updated_at: now });
        if (!error) return true;
        if (force) return false;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function pullFromCloud() {
  if (!sb || !_cloudUser) return null;
  try {
    const { data, error } = await sb.from('orvia_backups')
      .select('data, updated_at')
      .eq('user_id', _cloudUser.id)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function applyCloudBackup(remoteData, silent) {
  applyCleanBackup(sanitizeBackupData(remoteData), silent);
}

function applyCleanBackup(clean, silent) {
  state.sessions = clean.sessions;
  state.conges = clean.conges;
  state.quotas = clean.quotas;
  objectifs = clean.objectifs;
  primesHistory = clean.primesHistory;
  tauxHoraireHistory = clean.tauxHoraireHistory;
  applyCleanCongeTypes(clean);
  _syncSuppress++;
  try {
    save();
    saveConges();
    saveObjectifs();
    savePrimesHistory();
    saveTauxHoraireHistory();
  } finally { _syncSuppress--; }
  try {
    localStorage.setItem(SYNC_TOMB_KEY, JSON.stringify(normalizeTombstones(clean.tombstones)));
    rememberSyncKeys();
    setLocalSavedAt(clean.savedAt || Date.now());
    localStorage.setItem(SYNC_SIG_KEY, syncSignature(buildBackupData()));
  } catch (e) {}
  if (silent) {
    // Rafraîchit le contenu de tous les onglets sans changer celui affiché à l'écran.
    renderObjectifs();
    renderHistory();
    renderTrendChart();
    renderConges();
    renderReglages();
    renderPrimesHistoList();
    renderTauxHoraireHistoList();
  } else {
    switchTab('today');
    renderReglages();
  }
}

// Au premier chargement, si un lien magique vient d'être suivi, le client
// Supabase détecte automatiquement le jeton dans l'URL et déclenche cet event.
if (sb) {
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      _cloudUser = session.user;
      history.replaceState(null, '', window.location.pathname);
      const cfg = getSyncState();
      saveSyncState({ ...cfg, cloudEnabled: true });
      const remote = await pullFromCloud();
      if (remote && remote.data) {
        openCloudConflictModal(remote);
      } else {
        await pushToCloud();
        saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
        showToast('☁️ Connecté — première sauvegarde envoyée');
      }
      subscribeToCloudChanges();
      renderSyncStatusBadge();
      renderCloudSyncSettings();
    } else if (event === 'SIGNED_OUT') {
      unsubscribeFromCloudChanges();
      _cloudUser = null;
      renderSyncStatusBadge();
      renderCloudSyncSettings();
    }
  });
}

function openCloudConflictModal(remote) {
  const remoteDate = new Date(remote.updated_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const localCount = state.sessions.length;
  const remoteCount = Array.isArray(remote.data.sessions) ? remote.data.sessions.length : 0;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'cloudConflictModal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">☁️ Des données existent déjà dans le cloud</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px;">
        Dernière sauvegarde cloud : <strong style="color:var(--text)">${remoteDate}</strong> (${remoteCount} sessions).<br>
        Sur cet appareil : ${localCount} sessions.<br><br>
        Que voulez-vous faire ?
      </div>
      <div class="modal-actions" style="flex-direction:column;gap:8px;">
        <button class="modal-btn-save" onclick="resolveCloudConflict('merge')">🔀 Fusionner les deux (recommandé)</button>
        <button class="modal-btn-save" onclick="resolveCloudConflict('remote')">📥 Restaurer depuis le cloud (écrase cet appareil)</button>
        <button class="modal-btn-save" style="background:var(--accent2)" onclick="resolveCloudConflict('local')">📤 Envoyer cet appareil (écrase le cloud)</button>
        <button class="modal-btn-cancel" onclick="document.getElementById('cloudConflictModal').remove()">Décider plus tard</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function resolveCloudConflict(choice) {
  document.getElementById('cloudConflictModal').remove();
  if (choice === 'remote') {
    const remote = await pullFromCloud();
    if (remote && remote.data) {
      applyCloudBackup(remote.data);
      showToast('☁️ Données restaurées depuis le cloud ✓');
    }
  } else if (choice === 'merge') {
    const ok = await pushToCloud();
    if (ok) {
      saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
      showToast('☁️ Données fusionnées ✓');
    } else {
      showToast('⚠️ Fusion impossible pour le moment');
    }
  } else {
    await pushToCloud({ force: true });
    saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
    showToast('☁️ Données de cet appareil envoyées ✓');
  }
  renderSyncStatusBadge();
}

// Synchronisation automatique "au réveil" de l'app : pousse d'abord les
// changements locaux en attente (pour ne jamais perdre de données non
// envoyées), puis ne récupère le cloud que s'il est réellement plus récent
// que notre dernier point de synchronisation connu — ce qui, une fois le push
// fait, ne peut arriver que si un AUTRE appareil a écrit entre-temps.
let _autoSyncing = false;
async function autoSyncOnOpen() {
  if (_autoSyncing) return;
  const cfg = getSyncState();
  if (!cfg.cloudEnabled || !navigator.onLine) return;
  await refreshCloudUser();
  if (!_cloudUser) return;

  _autoSyncing = true;
  try {
    if (getSyncQueue().length > 0) {
      await processSyncQueue();
      if (getSyncQueue().length > 0) {
        // Le push a échoué : des changements locaux ne sont toujours pas
        // envoyés. On ne tire pas le cloud pour ne pas risquer d'écraser
        // ces changements avec une version distante plus ancienne.
        renderSyncStatusBadge();
        return;
      }
    }
    const remote = await pullFromCloud();
    if (!remote) return;
    const remoteTs = new Date(remote.updated_at).getTime();
    const localTs = getSyncState().lastSyncTs || 0;
    if (remoteTs > localTs) {
      // Fusion avec la version distante (et envoi si cet appareil a des données en plus).
      const ok = await pushToCloud();
      if (ok) {
        saveSyncState({ ...getSyncState(), lastSyncTs: Date.now() });
        if (_lastMergeApplied) showToast('☁️ Données mises à jour depuis un autre appareil');
      }
      renderSyncStatusBadge();
    }
  } finally {
    _autoSyncing = false;
  }
}

function openSyncStatusModal() {
  const phase = getSyncPhase();
  const meta = SYNC_PHASE_META[phase];
  const queue = getSyncQueue();
  const cfg = getSyncState();
  const lastSync = cfg.lastSyncTs ? new Date(cfg.lastSyncTs).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais';
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'syncStatusModalTmp';
  modal.style.display = 'flex';
  const queueHtml = queue.length
    ? queue.slice(-8).reverse().map(item => `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);padding:6px 0;border-bottom:1px solid var(--border);"><span>${escapeHtml(item.summary || item.kind)}</span><span style="color:var(--muted);">${new Date(item.ts).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')
    : '<div style="font-size:12px;color:var(--muted);padding:8px 0;">File d\'attente vide.</div>';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${meta.icon} ${meta.label}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:12px;">
        ${cfg.cloudEnabled
          ? `Dernière synchronisation cloud : ${lastSync}.`
          : `Aucune sauvegarde cloud n'est configurée pour le moment : tes données restent stockées uniquement sur cet appareil. La file d'attente ci-dessous se videra automatiquement dès qu'une synchronisation sera disponible.`}
      </div>
      <div style="font-weight:800;color:var(--accent);font-size:13px;margin-bottom:6px;">Modifications en attente (${queue.length})</div>
      <div style="max-height:220px;overflow-y:auto;margin-bottom:14px;">${queueHtml}</div>
      <div class="modal-actions">
        <button class="modal-btn-cancel" onclick="document.getElementById('syncStatusModalTmp').remove()">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function save() {
  localStorage.setItem('timetracker_sessions', JSON.stringify(state.sessions));
  localStorage.setItem('timetracker_current', JSON.stringify({
    status: state.status,
    startTs: state.startTs,
    pauseStart: state.pauseStart,
    totalPauseMs: state.totalPauseMs,
    startGeo: state.startGeo,
    workMode: state.workMode,
  }));
  if (typeof enqueueSyncChange === 'function') enqueueSyncChange('sessions', 'Sessions mises à jour');
}

