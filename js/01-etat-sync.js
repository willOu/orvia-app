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

const APP_VERSION = '2.12.2';


// ── STORAGE ──
// ── STOCKAGE LOCAL UNIQUEMENT ──
// La synchronisation cloud (Supabase) a été retirée : les données restent sur l'appareil
// et se sauvegardent par fichier (Réglages > Sauvegarde).
(function cleanupCloudLeftovers() {
  try {
    ['orvia_sync_queue', 'orvia_sync_state', 'orvia_sync_tombstones', 'orvia_sync_known_keys', 'orvia_sync_sig', 'orvia_local_saved_at', 'orvia_cloud_conflict']
      .forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
})();

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
}

