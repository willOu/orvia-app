// ── RAPPEL DE PAUSE PROLONGÉE ──
function getPauseReminderConfig() {
  const raw = localStorage.getItem('orvia_pause_reminder');
  if (!raw) return { enabled: false, minutes: 30 };
  try {
    const parsed = JSON.parse(raw);
    const allowedMinutes = [15, 30, 45, 60, 90];
    return {
      enabled: !!parsed.enabled,
      minutes: allowedMinutes.includes(Number(parsed.minutes)) ? Number(parsed.minutes) : 30,
    };
  } catch (e) {
    return { enabled: false, minutes: 30 };
  }
}

function savePauseReminderConfig(cfg) {
  localStorage.setItem('orvia_pause_reminder', JSON.stringify(cfg));
}

function renderPauseReminderSettings() {
  const cfg = getPauseReminderConfig();
  const enabledEl = document.getElementById('pauseReminderEnabled');
  const minutesEl = document.getElementById('pauseReminderMinutes');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (minutesEl) minutesEl.value = String(cfg.minutes);
}

function onPauseReminderToggle() {
  const cfg = getPauseReminderConfig();
  const enabledEl = document.getElementById('pauseReminderEnabled');
  cfg.enabled = enabledEl ? enabledEl.checked : false;
  savePauseReminderConfig(cfg);
  _pauseReminderFiredFor = null;
  if (cfg.enabled && ('Notification' in window) && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  showToast(cfg.enabled ? 'Rappel de pause activé ✓' : 'Rappel de pause désactivé');
}

function onPauseReminderMinutesChange() {
  const cfg = getPauseReminderConfig();
  const minutesEl = document.getElementById('pauseReminderMinutes');
  const allowedMinutes = [15, 30, 45, 60, 90];
  cfg.minutes = minutesEl && allowedMinutes.includes(Number(minutesEl.value)) ? Number(minutesEl.value) : 30;
  savePauseReminderConfig(cfg);
  _pauseReminderFiredFor = null;
  showToast(`Rappel de pause : ${cfg.minutes} min`);
}

// Mémorise le pauseStart pour lequel le rappel a déjà été envoyé, afin de
// n'avertir qu'une seule fois par pause (pas à chaque tick tant qu'on reste en pause).
let _pauseReminderFiredFor = null;

function checkPauseReminder() {
  if (state.status !== 'paused' || !state.pauseStart) {
    _pauseReminderFiredFor = null;
    return;
  }
  const cfg = getPauseReminderConfig();
  if (!cfg.enabled) return;
  if (_pauseReminderFiredFor === state.pauseStart) return;

  const elapsedMs = Date.now() - state.pauseStart;
  if (elapsedMs < cfg.minutes * 60000) return;

  _pauseReminderFiredFor = state.pauseStart;
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  if (canNotify) {
    orviaNotify('Pause prolongée ⏸️', { body: `Ta pause dure depuis plus de ${cfg.minutes} min.` });
  }
  showToast(`⏸️ Pause depuis plus de ${cfg.minutes} min`);
}

// Notification compatible iOS (PWA) : passe par le service worker, sinon repli sur l'API classique.
function orviaNotify(title, opts) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const o = Object.assign({ icon: 'icon-192.png' }, opts || {});
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, o))
        .catch(() => { try { new Notification(title, o); } catch (e) {} });
      return;
    }
    new Notification(title, o);
  } catch (e) {}
}

function loadNotifState() {
  try {
    const raw = localStorage.getItem('orvia_notif_state');
    if (!raw) return { dayHit:false, day80:false, weekHit:false, week80:false, lastDate:null, lastWeekKey:null, weeklyCapKey:null, weeklyCapWarned:false, weeklyCapExceeded:false };
    const p = JSON.parse(raw);
    return {
      dayHit: !!p.dayHit,
      day80: !!p.day80,
      weekHit: !!p.weekHit,
      week80: !!p.week80,
      lastDate: typeof p.lastDate === 'string' ? p.lastDate : null,
      lastWeekKey: Number.isFinite(p.lastWeekKey) ? p.lastWeekKey : null,
      weeklyCapKey: Number.isFinite(p.weeklyCapKey) ? p.weeklyCapKey : null,
      weeklyCapWarned: !!p.weeklyCapWarned,
      weeklyCapExceeded: !!p.weeklyCapExceeded,
    };
  } catch (e) {
    return { dayHit:false, day80:false, weekHit:false, week80:false, lastDate:null, lastWeekKey:null, weeklyCapKey:null, weeklyCapWarned:false, weeklyCapExceeded:false };
  }
}

function saveNotifState() {
  localStorage.setItem('orvia_notif_state', JSON.stringify(_notifState));
}

let _notifState = loadNotifState();
function checkGoalNotifications(dayTotal, dayGoal, weekTotal, weekGoal) {
  const today = todayKey();
  const weekKey = getMondayOf(new Date()).getTime();
  let changed = false;
  if (_notifState.lastDate !== today) {
    _notifState.lastDate = today;
    _notifState.dayHit = false;
    _notifState.day80 = false;
    changed = true;
  }
  if (_notifState.lastWeekKey !== weekKey) {
    _notifState.lastWeekKey = weekKey;
    _notifState.weekHit = false;
    _notifState.week80 = false;
    changed = true;
  }
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  if (dayGoal > 0) {
    const pctDay = dayTotal / dayGoal;
    if (pctDay >= 1 && !_notifState.dayHit) {
      _notifState.dayHit = true;
      changed = true;
      if (canNotify) orviaNotify('Objectif du jour atteint 🎉', { body: `${fmtHM(dayTotal)} / ${fmtHM(dayGoal)}` });
      showToast('Objectif du jour atteint 🎉');
    } else if (pctDay >= 0.8 && pctDay < 1 && !_notifState.day80) {
      _notifState.day80 = true;
      changed = true;
      if (canNotify) orviaNotify('Objectif du jour presque atteint', { body: `${fmtHM(dayTotal)} / ${fmtHM(dayGoal)}` });
    }
  }
  if (weekGoal > 0) {
    const pctWeek = weekTotal / weekGoal;
    if (pctWeek >= 1 && !_notifState.weekHit) {
      _notifState.weekHit = true;
      changed = true;
      if (canNotify) orviaNotify('Objectif de la semaine atteint 🎉', { body: `${fmtHM(weekTotal)} / ${fmtHM(weekGoal)}` });
      showToast('Objectif de la semaine atteint 🎉');
    } else if (pctWeek >= 0.8 && pctWeek < 1 && !_notifState.week80) {
      _notifState.week80 = true;
      changed = true;
      if (canNotify) orviaNotify('Objectif de la semaine presque atteint', { body: `${fmtHM(weekTotal)} / ${fmtHM(weekGoal)}` });
    }
  }
  if (changed) saveNotifState();
}


// ── PLANNING INTELLIGENT : PONTS, REPOS LÉGAL ET MODÈLES ──
function getDailyRules(){try{const x=JSON.parse(localStorage.getItem('orvia_daily_rules'));return {daily:x?.daily!==false,rest:x?.rest!==false}}catch(e){return {daily:true,rest:true}}}
function saveDailyRules(){const x={daily:document.getElementById('dailyCapEnabled')?.checked,rest:document.getElementById('restRuleEnabled')?.checked};localStorage.setItem('orvia_daily_rules',JSON.stringify(x));renderToday();}
function dayTotal(date){return state.sessions.filter(s=>s.date===date).reduce((a,s)=>a+s.net,0)}
function restViolations(){const ss=[...state.sessions].sort((a,b)=>a.start-b.start), out=[];for(let i=1;i<ss.length;i++){const gap=ss[i].start-ss[i-1].end;if(gap>=0&&gap<11*3600000&&tsToKey(ss[i].start)!==tsToKey(ss[i-1].start))out.push({gap,a:ss[i-1],b:ss[i]})}return out}
function renderDailyCompliance(){const el=document.getElementById('dailyComplianceBanner');if(!el)return;const r=getDailyRules(), h=dayTotal(todayKey())/3600000, v=restViolations().filter(x=>tsToKey(x.b.start)===todayKey());let msgs=[];if(r.daily&&h>=10)msgs.push(`⚠️ Plafond journalier dépassé : ${h.toFixed(1)}h / 10h`);else if(r.daily&&h>=9)msgs.push(`⏰ Plafond journalier proche : ${h.toFixed(1)}h / 10h`);if(r.rest&&v.length)msgs.push(`⚠️ Repos légal insuffisant : ${Math.floor(v[0].gap/3600000)}h${String(Math.floor(v[0].gap/60000)%60).padStart(2,'0')} entre deux journées (minimum 11h)`);el.style.display=msgs.length?'block':'none';el.innerHTML=msgs.map(x=>`<div style="background:rgba(245,158,11,.12);border:1px solid var(--orange);border-radius:12px;padding:10px 12px;margin-bottom:8px;font-size:12px;color:var(--orange);font-weight:700;">${x}</div>`).join('')}
function computeBridgeSuggestions(){const now=new Date(),year=now.getFullYear(),out=[];for(let d=new Date(year,0,1);d.getFullYear()===year;d.setDate(d.getDate()+1)){const k=toLocalISO(d);if(!isDateHoliday(k))continue;const dow=d.getDay();if(dow===2||dow===4){const p=new Date(d);p.setDate(d.getDate()+(dow===2?-1:1));const pk=toLocalISO(p);if(!isDateHoliday(pk)&&p.getDay()!==0&&p.getDay()!==6)out.push({date:pk,label:getHolidayLabel(k)})}}return out.filter(x=>x.date>=toLocalISO(now)).slice(0,5)}

// ══════════════════════════════════════════════════════════
// PONTS OPTIMISÉS MULTI-SEMAINES
// Va plus loin que la détection de ponts simple (jour isolé entre jour
// férié et week-end) : scanne une fenêtre glissante de plusieurs semaines
// à venir, détecte les périodes où poser peu de jours permet de gagner
// beaucoup de jours de repos consécutifs, et calcule un ratio
// "jours gagnés / jours posés" pour prioriser les meilleures opportunités.
// ══════════════════════════════════════════════════════════

function isNonWorkingDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow === 0 || dow === 6 || isDateHoliday(dateStr);
}

// Génère la liste des jours (statut travaillé/non-travaillé) sur une fenêtre glissante.
function buildDayWindow(startDate, numDays) {
  const days = [];
  const cur = new Date(startDate);
  for (let i = 0; i < numDays; i++) {
    const key = toLocalISO(cur);
    days.push({ date: key, nonWorking: isNonWorkingDay(key), holidayLabel: isDateHoliday(key) ? getHolidayLabel(key) : null });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Détecte, sur une fenêtre glissante (par défaut 12 semaines), tous les groupes
// de jours travaillés isolés entre deux périodes non-travaillées, et calcule
// le ratio jours gagnés / jours posés pour chaque opportunité de pont.
function computeAdvancedBridgeSuggestions(windowWeeks = 12) {
  const now = new Date();
  const numDays = windowWeeks * 7;
  const days = buildDayWindow(now, numDays);

  const opportunities = [];
  let i = 0;
  while (i < days.length) {
    if (!days[i].nonWorking) {
      // début d'un groupe de jours travaillés consécutifs
      let j = i;
      while (j < days.length && !days[j].nonWorking) j++;
      const workingBlockLen = j - i;
      // On ne considère que les blocs courts (1 à 4 jours) comme "pontables"
      if (workingBlockLen >= 1 && workingBlockLen <= 4 && i > 0 && j < days.length) {
        const beforeNonWorking = days[i - 1].nonWorking;
        const afterNonWorking = days[j] ? days[j].nonWorking : false;
        if (beforeNonWorking && afterNonWorking) {
          // Compte la période de repos totale obtenue en posant ce bloc
          let startRepos = i - 1;
          while (startRepos > 0 && days[startRepos - 1].nonWorking) startRepos--;
          let endRepos = j;
          while (endRepos < days.length - 1 && days[endRepos + 1] && days[endRepos + 1].nonWorking) endRepos++;
          const joursGagnes = endRepos - startRepos + 1;
          const joursPoses = workingBlockLen;
          const ratio = joursGagnes / joursPoses;
          const holidayLabels = days.slice(i - 1, j + 1).filter(d => d.holidayLabel).map(d => d.holidayLabel);
          opportunities.push({
            startPose: days[i].date,
            endPose: days[j - 1].date,
            joursPoses,
            joursGagnes,
            ratio,
            repos: { start: days[startRepos].date, end: days[endRepos] ? days[endRepos].date : days[days.length - 1].date },
            holidayContext: holidayLabels.length ? holidayLabels[0] : null
          });
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  return opportunities.sort((a, b) => b.ratio - a.ratio).slice(0, 6);
}

function fmtBridgeDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function renderAdvancedBridgeSuggestions() {
  const el = document.getElementById('advancedBridgeSuggestions');
  if (!el) return;
  const opportunities = computeAdvancedBridgeSuggestions();

  if (!opportunities.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);">Aucune opportunité de pont détectée sur les 12 prochaines semaines.</div>';
    return;
  }

  el.innerHTML = opportunities.map(o => {
    const ratioColor = o.ratio >= 3 ? 'var(--green)' : o.ratio >= 2 ? 'var(--orange)' : 'var(--muted)';
    const period = o.startPose === o.endPose ? fmtBridgeDate(o.startPose) : `${fmtBridgeDate(o.startPose)} → ${fmtBridgeDate(o.endPose)}`;
    const contextLabel = o.holidayContext ? ` (autour de ${o.holidayContext})` : '';
    return `<div class="objectif-card" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:13px;color:var(--text);">Poser le ${period}${contextLabel}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px;">Repos du ${fmtBridgeDate(o.repos.start)} au ${fmtBridgeDate(o.repos.end)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:800;font-size:15px;color:${ratioColor};">×${o.ratio.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--muted);">${o.joursPoses}j posé${o.joursPoses > 1 ? 's' : ''} → ${o.joursGagnes}j gagnés</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function getTemplates(){try{const a=JSON.parse(localStorage.getItem('orvia_session_templates'));return Array.isArray(a)?a:[]}catch(e){return []}}
function saveTemplates(a){localStorage.setItem('orvia_session_templates',JSON.stringify(a))}
function addSessionTemplate(){const name=prompt('Nom du modèle (ex : Journée standard)');if(!name)return;const start=prompt('Heure de début (HH:MM)','09:00');const end=prompt('Heure de fin (HH:MM)','17:00');const pause=Number(prompt('Pause en minutes','60'));if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||!Number.isFinite(pause))return showToast('Modèle invalide');const a=getTemplates();a.push({id:Date.now(),name:name.slice(0,40),start,end,pause:Math.max(0,pause)});saveTemplates(a);renderPlanningTools()}
function applySessionTemplate(id){const t=getTemplates().find(x=>x.id===id);if(!t)return;openAddSessionModal();document.getElementById('addSessionStart').value=t.start;document.getElementById('addSessionEnd').value=t.end;document.getElementById('addSessionPause').value=t.pause;showToast(`Modèle « ${t.name} » appliqué`) }
function deleteSessionTemplate(id){saveTemplates(getTemplates().filter(x=>x.id!==id));renderPlanningTools()}
function renderPlanningTools(){renderAdvancedBridgeSuggestions();const r=getDailyRules();const a=document.getElementById('dailyCapEnabled'),b=document.getElementById('restRuleEnabled');if(a)a.checked=r.daily;if(b)b.checked=r.rest;const br=document.getElementById('bridgeSuggestions');if(br){const x=computeBridgeSuggestions();br.innerHTML=x.length?x.map(z=>`<div style="padding:7px 0;border-bottom:1px solid var(--border);">💡 Poser le <b>${z.date}</b> autour de ${z.label}</div>`).join(''):'Aucun pont à venir détecté.'}const el=document.getElementById('sessionTemplatesList');if(el)el.innerHTML=getTemplates().map(t=>`<div class="settings-row"><span><b>${escapeHtml(t.name)}</b><br><small>${t.start}–${t.end} · pause ${t.pause} min</small></span><span><button onclick="applySessionTemplate(${t.id})">Appliquer</button> <button onclick="deleteSessionTemplate(${t.id})">✕</button></span></div>`).join('')||'<span style="font-size:12px;color:var(--muted)">Aucun modèle enregistré.</span>'}
function openPlanningTools(){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-planning-tools').classList.add('active');renderPlanningTools()}

// ── ALERTE PLAFOND HORAIRE LÉGAL HEBDOMADAIRE ──
// Prévient si le temps de travail hebdomadaire dépasse un seuil légal
// configurable (48h par défaut en France, durée maximale absolue sauf
// dérogations), pour éviter les dépassements involontaires.
function getWeeklyLegalCapConfig() {
  try {
    const raw = localStorage.getItem('orvia_weekly_cap_config');
    if (!raw) return { enabled: true, capHours: 48, warnAtPct: 90 };
    const p = JSON.parse(raw);
    return {
      enabled: p.enabled !== false,
      capHours: Number.isFinite(Number(p.capHours)) ? clampNumber(Number(p.capHours), 1, 168, 48) : 48,
      warnAtPct: Number.isFinite(Number(p.warnAtPct)) ? clampNumber(Number(p.warnAtPct), 50, 100, 90) : 90
    };
  } catch (e) {
    return { enabled: true, capHours: 48, warnAtPct: 90 };
  }
}

function saveWeeklyLegalCapConfig(cfg) {
  localStorage.setItem('orvia_weekly_cap_config', JSON.stringify(cfg));
}

function checkWeeklyLegalCap(weekTotalMs) {
  const cfg = getWeeklyLegalCapConfig();
  if (!cfg.enabled) return;
  const weekKey = getMondayOf(new Date()).getTime();
  const weekHeures = weekTotalMs / 3600000;
  const capMs = cfg.capHours * 3600000;
  const warnMs = capMs * (cfg.warnAtPct / 100);

  if (!_notifState.weeklyCapKey || _notifState.weeklyCapKey !== weekKey) {
    _notifState.weeklyCapKey = weekKey;
    _notifState.weeklyCapWarned = false;
    _notifState.weeklyCapExceeded = false;
  }

  const canNotify = ('Notification' in window) && Notification.permission === 'granted';

  if (weekTotalMs >= capMs && !_notifState.weeklyCapExceeded) {
    _notifState.weeklyCapExceeded = true;
    saveNotifState();
    const msg = `Tu as dépassé le plafond légal de ${cfg.capHours}h cette semaine (${weekHeures.toFixed(1)}h travaillées).`;
    if (canNotify) orviaNotify('⚠️ Plafond horaire dépassé', { body: msg });
    showToast('⚠️ ' + msg);
  } else if (weekTotalMs >= warnMs && weekTotalMs < capMs && !_notifState.weeklyCapWarned) {
    _notifState.weeklyCapWarned = true;
    saveNotifState();
    const msg = `Tu approches du plafond légal de ${cfg.capHours}h/semaine (${weekHeures.toFixed(1)}h travaillées).`;
    if (canNotify) orviaNotify('Plafond horaire proche', { body: msg });
    showToast('⏰ ' + msg);
  }
}

function renderWeeklyCapBanner(weekTotalMs) {
  const el = document.getElementById('weeklyCapBanner');
  if (!el) return;
  const cfg = getWeeklyLegalCapConfig();
  if (!cfg.enabled) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const weekHeures = weekTotalMs / 3600000;
  const capMs = cfg.capHours * 3600000;
  const warnMs = capMs * (cfg.warnAtPct / 100);

  if (weekTotalMs >= capMs) {
    el.style.display = 'block';
    el.innerHTML = `<div style="background:rgba(239,68,68,.12);border:1px solid var(--accent2);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--accent2);font-size:13px;">⚠️ Plafond horaire légal dépassé (${weekHeures.toFixed(1)}h / ${cfg.capHours}h)</div>
    </div>`;
  } else if (weekTotalMs >= warnMs) {
    el.style.display = 'block';
    el.innerHTML = `<div style="background:rgba(245,158,11,.12);border:1px solid var(--orange);border-radius:12px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-weight:700;color:var(--orange);font-size:13px;">⏰ Plafond horaire proche (${weekHeures.toFixed(1)}h / ${cfg.capHours}h)</div>
    </div>`;
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function openWeeklyCapSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-weeklycap-settings').classList.add('active');
  renderWeeklyCapSettingsForm();
}

function renderWeeklyCapSettingsForm() {
  const cfg = getWeeklyLegalCapConfig();
  const enabledEl = document.getElementById('weeklyCapEnabled');
  const capEl = document.getElementById('weeklyCapHours');
  const warnEl = document.getElementById('weeklyCapWarnPct');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (capEl) capEl.value = cfg.capHours;
  if (warnEl) warnEl.value = cfg.warnAtPct;
}

function onWeeklyCapSettingsChange() {
  const enabledEl = document.getElementById('weeklyCapEnabled');
  const capEl = document.getElementById('weeklyCapHours');
  const warnEl = document.getElementById('weeklyCapWarnPct');
  const cfg = {
    enabled: enabledEl ? enabledEl.checked : true,
    capHours: capEl ? clampNumber(Number(capEl.value), 1, 168, 48) : 48,
    warnAtPct: warnEl ? clampNumber(Number(warnEl.value), 50, 100, 90) : 90
  };
  saveWeeklyLegalCapConfig(cfg);
  showToast('Réglages mis à jour ✓');
  renderObjectifs();
}

function renderObjectifs() {
  const today = todayKey();
  const todayISO = toLocalISO(new Date());
  // Heures du jour (sessions terminées)
  const todaySessions = state.sessions.filter(s => s.date === today);
  let dayDone = todaySessions.reduce((a, s) => a + s.net, 0);
  // Ajouter la session en cours si running/paused
  let liveMs = 0;
  if (state.status !== 'idle' && state.startTs) {
    const now = Date.now();
    let pause = state.totalPauseMs;
    if (state.status === 'paused' && state.pauseStart) pause += now - state.pauseStart;
    liveMs = Math.max(0, now - state.startTs - pause);
  }
  // RTT comptée comme temps de travail effectif : ajoute l'objectif du jour
  // au réalisé si aujourd'hui est un jour de RTT posé (aucune session requise).
  if (isDateOnRTT(todayISO)) dayDone += getGoalForDow(new Date().getDay());
  const dayTotal = dayDone + liveMs;

  // Heures de la semaine (sessions terminées + live)
  const weekSessions = getWeekSessions();
  let weekDone = weekSessions.reduce((a, s) => a + s.net, 0);
  const mondayThisWeek = getMondayOf(new Date());
  const weekEndThisWeek = new Date(mondayThisWeek); weekEndThisWeek.setDate(mondayThisWeek.getDate() + 7);
  weekDone += getRTTGoalMsForRange(mondayThisWeek, weekEndThisWeek);
  const weekTotal = weekDone + liveMs;

  const block = document.getElementById('objectifsBlock');
  if (!block) return;

  const dowToday = new Date().getDay();
  const jourGoal = (objectifs.parJour && typeof objectifs.parJour[dowToday] !== 'undefined') ? objectifs.parJour[dowToday] : objectifs.jour;
  const weekGoalAjuste = getWeekGoalAjuste();

  checkGoalNotifications(dayTotal, jourGoal, weekTotal, weekGoalAjuste);

  function barHtml(done, goal, label) {
    const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
    const colorClass = pct >= 100 ? 'done' : pct >= 75 ? 'warning' : 'progress';
    const pctLabel = goal > 0 ? Math.round(pct) + '%' : '—';
    return `<div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">${label}</span>
        <span class="objectif-values" style="color:${pct>=100?'var(--green)':pct>=75?'var(--orange)':'var(--accent)'}">${fmtHM(done)} <span style="color:var(--muted);font-weight:500">/ ${fmtHM(goal)}</span> <span style="font-size:11px;color:var(--muted)">${pctLabel}</span></span>
      </div>
      <div class="objectif-bar-bg">
        <div class="objectif-bar-fill ${colorClass}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }

  block.innerHTML =
    barHtml(dayTotal, jourGoal, 'Objectif du jour') +
    barHtml(weekTotal, weekGoalAjuste, 'Objectif de la semaine' + (weekGoalAjuste !== getWeekGoalBase() ? ' (ajusté congés)' : ''));

  renderOvertimeCard();
  renderRemunerationCardInto('remunerationCard', dayTotal, jourGoal, weekTotal, weekGoalAjuste);
  renderMonthForecastCard();
  renderTaxThresholdBanner();
  updateAppBadge(dayTotal);
  checkWeeklyLegalCap(weekTotal);
  renderWeeklyCapBanner(weekTotal);
}

// ── BADGE SUR L'ICÔNE DE L'APP ──
// Affiche les heures travaillées aujourd'hui (arrondies) directement sur l'icône,
// via la Badging API (supportée par iOS 16.4+ pour les PWA installées).
let _lastBadgeHours = null;
function updateAppBadge(dayTotalMs) {
  if (!('setAppBadge' in navigator)) return;
  const hours = Math.round((dayTotalMs || 0) / 3600000);
  if (hours === _lastBadgeHours) return;
  _lastBadgeHours = hours;
  try {
    if (hours > 0) {
      navigator.setAppBadge(hours).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  } catch (e) {}
}

function isDateOnConge(dateStr) {
  return state.conges.some(c => dateStr >= c.start && dateStr <= (c.end || c.start));
}

// Les RTT sont traitées comme du temps de travail effectif (option la plus sûre
// côté paie) : contrairement aux CP, elles ne réduisent pas l'objectif du jour
// et sont comptabilisées comme "réalisées" à hauteur de l'objectif du jour,
// pour que compteur hebdo et graphiques ne tombent pas à 0h ces jours-là.
function isDateOnRTT(dateStr) {
  return state.conges.some(c => c.type === 'rtt' && dateStr >= c.start && dateStr <= (c.end || c.start));
}

function getGoalForDow(dow) {
  return (objectifs.parJour && typeof objectifs.parJour[dow] !== 'undefined') ? objectifs.parJour[dow] : objectifs.jour;
}

function getRTTGoalMsForRange(startDate, endDateExclusive) {
  let total = 0;
  let cur = new Date(startDate);
  while (cur < endDateExclusive) {
    const dateStr = toLocalISO(cur);
    if (isDateOnRTT(dateStr)) total += getGoalForDow(cur.getDay());
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

function getWeekGoalBase() {
  const order = [1,2,3,4,5,6,0];
  return order.reduce((sum, d) => sum + ((objectifs.parJour && typeof objectifs.parJour[d] !== 'undefined') ? objectifs.parJour[d] : (d === 0 || d === 6 ? 0 : objectifs.jour)), 0);
}

function getWeekGoalForMonday(monday) {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dow = d.getDay();
    const dateStr = toLocalISO(d);
    const goalDay = getGoalForDow(dow);
    // Les RTT restent comptées dans l'objectif (contrairement aux CP qui le réduisent),
    // car elles sont traitées comme du temps de travail effectif.
    if (isDateOnRTT(dateStr)) { total += goalDay; continue; }
    if (!isDateOnConge(dateStr) && !isDateHoliday(dateStr)) total += goalDay;
  }
  return total;
}

function getMonthGoal(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const dow = d.getDay();
    const dateStr = toLocalISO(d);
    const goalDay = getGoalForDow(dow);
    if (isDateOnRTT(dateStr)) { total += goalDay; continue; }
    if (!isDateOnConge(dateStr) && !isDateHoliday(dateStr)) total += goalDay;
  }
  return total;
}

function getWeekGoalAjuste() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1); monday.setHours(0,0,0,0);
  return getWeekGoalForMonday(monday);
}

let _undoDeleteTimer=null,_undoDeleteSession=null,_undoDeleteIdx=null;
function deleteSession(idx){
  if(_undoDeleteTimer){clearTimeout(_undoDeleteTimer);_undoDeleteTimer=null;if(window._undoConfirm){const f=window._undoConfirm;window._undoConfirm=null;f();}}
  _undoDeleteSession=state.sessions[idx];_undoDeleteIdx=idx;
  const _deletedSummary = _undoDeleteSession ? `${fmtTime(_undoDeleteSession.start)}-${fmtTime(_undoDeleteSession.end)} le ${new Date(_undoDeleteSession.start).toLocaleDateString('fr-FR')}` : '';
  state.sessions.splice(idx,1);renderToday();renderHistory();
  showUndoToast('Session supprimee',()=>{
    if(_undoDeleteSession!==null){state.sessions.splice(_undoDeleteIdx,0,_undoDeleteSession); state.sessions.sort((a,b)=>a.start-b.start);_undoDeleteSession=null;save();renderToday();renderHistory();}
  },()=>{_undoDeleteSession=null;save();logAuditEntry('session', 'suppression', _deletedSummary);});
}
function showUndoToast(msg,onUndo,onConfirm){
  let t=document.getElementById('undoToast');
  if(!t){t=document.createElement('div');t.id='undoToast';t.style.cssText='position:fixed;bottom:calc(80px + var(--safe-bottom));left:50%;transform:translateX(-50%) translateY(20px);background:#1e293b;color:#e8eaf6;padding:12px 18px;border-radius:100px;font-size:13px;font-weight:700;opacity:0;transition:all .3s;z-index:9999;white-space:nowrap;display:flex;align-items:center;gap:12px;border:1px solid #2e3248;overflow:hidden;';document.body.appendChild(t);}
  t.innerHTML='<span>'+msg+'</span><button onclick="cancelUndo()" style="background:var(--orange);border:none;color:#0b1f2a;font-size:12px;font-weight:800;padding:5px 14px;border-radius:100px;cursor:pointer;">Annuler</button><div id="undoBar" style="position:absolute;bottom:0;left:0;height:3px;background:var(--orange);width:100%;transition:width 5s linear;"></div>';
  t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const b=document.getElementById('undoBar');if(b)b.style.width='0%';}));
  window._undoCallback=onUndo;
  window._undoConfirm=onConfirm||null;
  if(_undoDeleteTimer)clearTimeout(_undoDeleteTimer);
  _undoDeleteTimer=setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(-50%) translateY(20px)';window._undoConfirm=null;if(onConfirm)onConfirm();window._undoCallback=null;},5000);
}
function cancelUndo(){
  if(window._undoCallback)window._undoCallback();
  window._undoCallback=null;
  window._undoConfirm=null;
  if(_undoDeleteTimer){clearTimeout(_undoDeleteTimer);_undoDeleteTimer=null;}
  const t=document.getElementById('undoToast');
  if(t){t.style.opacity='0';t.style.transform='translateX(-50%) translateY(20px)';}
  showToast(window._undoRestoreMsg || 'Session restauree');
  window._undoRestoreMsg=null;
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getRecuperations() {
  try {
    const raw = localStorage.getItem('orvia_recuperations');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(r => r && typeof r.ms === 'number' && Number.isFinite(r.ms) && typeof r.date === 'string');
  } catch (e) {
    return [];
  }
}

function saveRecuperations(list) {
  localStorage.setItem('orvia_recuperations', JSON.stringify(list));
}

function addRecuperation(ms, note) {
  const list = getRecuperations();
  list.push({ id: Date.now() + Math.floor(Math.random()*100000), date: toLocalISO(new Date()), ms: clampNumber(ms, 0, 24 * 3600000, 0), note: (note || '').slice(0, 80) });
  saveRecuperations(list);
}

function deleteRecuperation(id) {
  const list = getRecuperations().filter(r => r.id !== id);
  saveRecuperations(list);
}

function getOvertimeBalance() {
  const monday = getMondayOf(new Date());
  const weekEnd = new Date(monday); weekEnd.setDate(monday.getDate() + 7);

  const weekSessions = state.sessions.filter(s => s.start >= monday.getTime() && s.start < weekEnd.getTime());
  let weekDone = weekSessions.reduce((a, s) => a + (s.net || 0), 0);
  // RTT comptée comme temps de travail effectif dans le solde d'heures sup.
  weekDone += getRTTGoalMsForRange(monday, weekEnd);

  if (state.status !== 'idle' && state.startTs) {
    const now = Date.now();
    let pause = state.totalPauseMs;
    if (state.status === 'paused' && state.pauseStart) pause += now - state.pauseStart;
    weekDone += Math.max(0, now - state.startTs - pause);
  }

  const weekGoal = getWeekGoalForMonday(monday);

  const recupThisWeek = getRecuperations()
    .filter(r => {
      const rd = new Date(r.date + 'T00:00:00');
      return rd >= monday && rd < weekEnd;
    })
    .reduce((a, r) => a + r.ms, 0);

  return weekDone - weekGoal - recupThisWeek;
}

function renderOvertimeCardInto(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const balance = getOvertimeBalance();
  const isPositive = balance >= 0;
  const color = isPositive ? 'var(--green)' : 'var(--accent2)';
  const sign = isPositive ? '+' : '-';
  el.innerHTML = `
    <div class="objectif-card">
      <div class="objectif-header">
        <span class="objectif-label">Solde heures supplémentaires</span>
        <span class="objectif-values" style="color:${color}">${sign}${fmtHM(Math.abs(balance))}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">
        ${isPositive ? 'Cette semaine, par rapport à ton objectif' : 'Déficit à rattraper cette semaine'}
      </div>
    </div>
  `;
}

function renderOvertimeCard() {
  renderOvertimeCardInto('overtimeCard');
}

function renderRecuperationsList() {
  const el = document.getElementById('recuperationsList');
  if (!el) return;
  const list = getRecuperations().sort((a, b) => b.id - a.id);
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="emoji">⏱</div>Aucune récupération enregistrée</div>`;
    return;
  }
  el.innerHTML = list.map(r => `
    <div class="conge-list-item">
      <div>
        <div class="cl-type" style="color:var(--accent)">Récupération</div>
        <div class="cl-dates">${escapeHtml(r.date)}${r.note ? ' — ' + escapeHtml(r.note) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="cl-days" style="color:var(--accent)">${fmtHM(r.ms)}</span>
        <button class="conge-delete" onclick="removeRecuperation(${r.id})">✕</button>
      </div>
    </div>
  `).join('');
}

function submitRecuperation() {
  const h = Number(document.getElementById('recupHours').value);
  const m = Number(document.getElementById('recupMinutes').value);
  const note = document.getElementById('recupNote').value;
  if (!Number.isFinite(h) && !Number.isFinite(m)) { showToast('Durée invalide'); return; }
  const ms = (Math.max(0, h || 0) * 3600000) + (Math.max(0, m || 0) * 60000);
  if (ms <= 0) { showToast('Durée invalide'); return; }
  addRecuperation(ms, note);
  document.getElementById('recupHours').value = '';
  document.getElementById('recupMinutes').value = '';
  document.getElementById('recupNote').value = '';
  renderRecuperationsList();
  renderOvertimeCard();
  showToast('Récupération enregistrée');
}

function removeRecuperation(id) {
  if (!confirm('Supprimer cette récupération ?')) return;
  deleteRecuperation(id);
  renderRecuperationsList();
  renderOvertimeCard();
}



