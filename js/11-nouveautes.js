// ═══════════════════════════════════════════════════════════
// ORVIA v2.5 — nouveautés :
//  1. Rappel de fin de journée (session oubliée)
//  2. Correction rapide d'une journée (historique)
//  9. Simulateur de congés
// 13. Sauvegarde hebdomadaire (rappel + export / partage)
// ═══════════════════════════════════════════════════════════

// ── 1. RAPPEL DE FIN DE JOURNÉE ─────────────────────────────
function getFinJourneeConfig() {
  const def = { enabled: true, time: '17:30', handledFor: null };
  try {
    const p = JSON.parse(localStorage.getItem('orvia_fin_journee') || 'null');
    if (!p) return def;
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : true,
      time: /^\d{2}:\d{2}$/.test(p.time) ? p.time : def.time,
      handledFor: Number.isFinite(p.handledFor) ? p.handledFor : null,
    };
  } catch (e) { return def; }
}
function saveFinJourneeConfig(c) { localStorage.setItem('orvia_fin_journee', JSON.stringify(c)); }

function renderFinJourneeSettings() {
  const c = getFinJourneeConfig();
  const en = document.getElementById('finJourneeEnabled');
  const tm = document.getElementById('finJourneeTime');
  if (en) en.checked = c.enabled;
  if (tm) tm.value = c.time;
}
function onFinJourneeChange() {
  const c = getFinJourneeConfig();
  const en = document.getElementById('finJourneeEnabled');
  const tm = document.getElementById('finJourneeTime');
  c.enabled = en ? en.checked : true;
  if (tm && /^\d{2}:\d{2}$/.test(tm.value)) c.time = tm.value;
  c.handledFor = null;
  saveFinJourneeConfig(c);
  if (c.enabled && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  showToast(c.enabled ? `Rappel de fin de journée à ${c.time} ✓` : 'Rappel de fin de journée désactivé');
  checkEndOfDay();
}

// Fin de journée du jour de démarrage de la session (HH:MM → timestamp).
function finJourneeTsFor(startTs, time) {
  return combineDateTimeToTs(tsToDateInput(startTs), time);
}

// Appelé toutes les minutes et au retour sur l'app : si le chrono tourne encore
// après l'heure de fin de journée (ou depuis la veille), on propose de le clore.
function checkEndOfDay() {
  const c = getFinJourneeConfig();
  if (!c.enabled || state.status === 'idle' || !state.startTs) return;
  if (c.handledFor === state.startTs) return;
  const now = Date.now();
  let endTs = finJourneeTsFor(state.startTs, c.time);
  if (Number.isNaN(endTs)) return;
  // Session démarrée après l'heure de fin : on regarde le lendemain.
  if (endTs <= state.startTs) endTs += 24 * 3600000;
  if (now < endTs) return;
  c.handledFor = state.startTs;
  saveFinJourneeConfig(c);
  orviaNotify('Tu as oublié de terminer ? ⏰', { body: `Ton chrono tourne depuis ${fmtTime(state.startTs)}. Ouvre Orvia pour le clore à ${fmtTime(endTs)}.`, tag: 'orvia-fin-journee' });
  openForgottenSessionModal();
  const input = document.getElementById('forgottenSessionEndTime');
  if (input) input.value = tsToTimeInput(endTs);
  const intro = document.getElementById('forgottenSessionIntro');
  if (intro) intro.innerHTML = `Ton chrono tourne toujours après l'heure de fin de journée (<strong>${c.time}</strong>). Démarré à <strong>${fmtTime(state.startTs)}</strong> (${tsToKey(state.startTs)}), soit <strong>${fmtHM(now - state.startTs)}</strong> écoulées.`;
}

// ── 2. CORRECTION RAPIDE D'UNE JOURNÉE ──────────────────────
let _dayEdit = null;

function openDayEditor(dateKey) {
  const list = state.sessions.filter(s => s.date === dateKey).sort((a, b) => a.start - b.start);
  if (!list.length) return;
  _dayEdit = {
    dateKey,
    iso: tsToDateInput(list[0].start),
    rows: list.map(s => ({
      ref: s, del: false,
      start: tsToTimeInput(s.start), end: tsToTimeInput(s.end),
      pause: Math.round((s.pauseMs || 0) / 60000),
      o: { start: tsToTimeInput(s.start), end: tsToTimeInput(s.end), pause: Math.round((s.pauseMs || 0) / 60000) },
    })),
  };
  renderDayEditor();
  document.getElementById('dayEditModal').style.display = 'flex';
}
function closeDayEditor() {
  document.getElementById('dayEditModal').style.display = 'none';
  _dayEdit = null;
}
function dayEditRowNet(r) {
  const a = combineDateTimeToTs(_dayEdit.iso, r.start);
  let b = combineDateTimeToTs(_dayEdit.iso, r.end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  if (b <= a) b += 24 * 3600000;
  return Math.max(0, (b - a) - Math.max(0, (Number(r.pause) || 0)) * 60000);
}
function renderDayEditor() {
  if (!_dayEdit) return;
  const d = new Date(_dayEdit.iso + 'T00:00:00');
  document.getElementById('dayEditTitle').textContent = '✏️ ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const inp = 'background:rgba(255,255,255,.12);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:8px 6px;font-size:13px;width:100%;box-sizing:border-box;min-width:0;';
  document.getElementById('dayEditRows').innerHTML = _dayEdit.rows.map((r, i) => {
    const net = dayEditRowNet(r);
    return `<div style="border:1px solid var(--border);border-radius:16px;padding:10px;margin-bottom:8px;${r.del ? 'opacity:.4;' : ''}">
      <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1.25fr) minmax(0,.8fr);gap:6px;align-items:end">
        <div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Arrivée</div><input type="time" value="${r.start}" style="${inp}" oninput="dayEditSet(${i},'start',this.value)"></div>
        <div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Fin</div><input type="time" value="${r.end}" style="${inp}" oninput="dayEditSet(${i},'end',this.value)"></div>
        <div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Pause min</div><input type="number" min="0" value="${r.pause}" style="${inp}" oninput="dayEditSet(${i},'pause',this.value)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px">
        <span style="color:var(--green);font-weight:700" id="dayEditNet${i}">${net === null ? '—' : 'Net ' + fmtHM(net)}</span>
        <button onclick="dayEditToggleDel(${i})" style="background:none;border:none;color:var(--accent2);font-size:12px;font-weight:700;cursor:pointer">${r.del ? '↩ Garder' : '🗑 Supprimer'}</button>
      </div>
    </div>`;
  }).join('');
  const tpls = (typeof getTemplates === 'function') ? getTemplates() : [];
  document.getElementById('dayEditTemplates').innerHTML = tpls.length
    ? `<div style="font-size:11px;color:var(--muted);margin:4px 0 6px">Ajouter une journée type :</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${tpls.map(t => `<button onclick="dayEditAddTemplate(${t.id})" style="background:var(--g-fill-strong,rgba(255,255,255,.2));border:1px solid var(--border);color:var(--text);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">${escapeHtml(t.name)} · ${t.start}-${t.end}</button>`).join('')}</div>`
    : '';
}
function dayEditSet(i, k, v) {
  _dayEdit.rows[i][k] = v;
  const net = dayEditRowNet(_dayEdit.rows[i]);
  const el = document.getElementById('dayEditNet' + i);
  if (el) el.textContent = net === null ? '—' : 'Net ' + fmtHM(net);
}
function dayEditToggleDel(i) { _dayEdit.rows[i].del = !_dayEdit.rows[i].del; renderDayEditor(); }
function dayEditAddRow(start, end, pause, note) {
  _dayEdit.rows.push({ ref: null, del: false, start: start || '08:00', end: end || '17:00', pause: pause == null ? 60 : pause, note: note || 'Session ajoutée manuellement', o: null });
  renderDayEditor();
}
function dayEditAddTemplate(id) {
  const t = getTemplates().find(x => x.id === id);
  if (t) dayEditAddRow(t.start, t.end, t.pause, t.name);
}
function saveDayEditor() {
  if (!_dayEdit) return;
  const errEl = document.getElementById('dayEditError');
  const fail = m => { errEl.textContent = m; errEl.style.display = 'block'; };
  errEl.style.display = 'none';
  const planned = [];
  for (const r of _dayEdit.rows) {
    if (r.del) continue;
    let a = combineDateTimeToTs(_dayEdit.iso, r.start);
    let b = combineDateTimeToTs(_dayEdit.iso, r.end);
    if (Number.isNaN(a) || Number.isNaN(b)) return fail('Heure invalide.');
    if (b <= a) b += 24 * 3600000;
    const changed = !r.o || r.o.start !== r.start || r.o.end !== r.end;
    if (changed && arrondi.enabled) { const x = applyArrondiToSession(a, b); a = x.start; b = x.end; }
    const dur = b - a;
    if (dur > 20 * 3600000) return fail('Durée trop longue (max 20 h). Vérifie les horaires.');
    const p = Number(r.pause);
    if (!Number.isFinite(p) || p < 0) return fail('Pause invalide.');
    planned.push({ r, a, b, pauseMs: Math.min(p * 60000, dur) });
  }
  const editedRefs = new Set(_dayEdit.rows.map(r => r.ref).filter(Boolean));
  const others = state.sessions.filter(s => !editedRefs.has(s));
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      if (sessionsOverlap(planned[i].a, planned[i].b, planned[j].a, planned[j].b)) return fail('Deux sessions de cette journée se chevauchent.');
    }
    if (others.some(o => sessionsOverlap(planned[i].a, planned[i].b, o.start, o.end))) return fail('Ces horaires chevauchent une session d\'une autre journée.');
  }
  // application
  const removed = _dayEdit.rows.filter(r => r.del && r.ref).map(r => r.ref);
  if (removed.length) state.sessions = state.sessions.filter(s => !removed.includes(s));
  planned.forEach(({ r, a, b, pauseMs }) => {
    if (r.ref) {
      r.ref.start = a; r.ref.end = b; r.ref.pauseMs = pauseMs; r.ref.net = Math.max(0, (b - a) - pauseMs); r.ref.date = tsToKey(a);
    } else {
      state.sessions.push({ date: tsToKey(a), start: a, end: b, pauseMs, net: Math.max(0, (b - a) - pauseMs), note: r.note || 'Session ajoutée manuellement' });
    }
  });
  state.sessions.sort((x, y) => x.start - y.start);
  save();
  logAuditEntry('session', 'modification', `Journée du ${_dayEdit.dateKey} corrigée (${planned.length} session(s), ${removed.length} supprimée(s))`);
  closeDayEditor();
  renderToday();
  renderHistory();
  showToast('Journée mise à jour ✓');
}

// ── 9. SIMULATEUR DE CONGÉS ─────────────────────────────────
function syncSimTypes() {
  const src = document.getElementById('congeType');
  const dst = document.getElementById('simType');
  if (!src || !dst) return;
  if (dst.innerHTML !== src.innerHTML) { const v = dst.value; dst.innerHTML = src.innerHTML; if (v) dst.value = v; }
}
function fmtDateFR(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }

function simulateConge() {
  syncSimTypes();
  const out = document.getElementById('simResult');
  const type = document.getElementById('simType').value;
  const start = document.getElementById('simStart').value;
  const end = document.getElementById('simEnd').value || start;
  if (!start) { out.innerHTML = ''; return; }
  const row = (ico, txt, cls) => `<div style="display:flex;gap:8px;margin:6px 0;font-size:13px;line-height:1.4;${cls === 'bad' ? 'color:var(--accent2);' : cls === 'warn' ? 'color:var(--orange);' : ''}"><span>${ico}</span><span>${txt}</span></div>`;
  if (end < start) { out.innerHTML = row('⚠️', 'La date de fin est avant le début.', 'bad'); return; }

  const unit = congeUnitFor(type);
  const days = computeCongeDays(start, end, unit);
  const rows = [];
  rows.push(row('📅', `Du <b>${fmtDateFR(start)}</b> au <b>${fmtDateFR(end)}</b> : <b>${days} jour${days > 1 ? 's' : ''}</b> décompté${days > 1 ? 's' : ''}${unit === 'ouv' ? ' (jours ouvrables, lundi–samedi hors fériés)' : ' (jours ouvrés, hors fériés)'}.`));
  if (!days) { out.innerHTML = rows.join('') + row('ℹ️', 'Aucun jour décompté sur cette période.'); return; }

  let ok = true;
  const isCustom = customCongeTypes.some(t => t.id === type);
  if (!isCustom) {
    const year = Number(start.slice(0, 4));
    const taken = getCongesTakenForYear(type, year);
    const quota = getEffectiveQuotaForYear(type, year);
    const after = quota - taken - days;
    if (after < 0) { ok = false; rows.push(row('⛔', `Quota dépassé : il te reste ${Math.max(0, quota - taken)} j, il en faudrait ${days}.`, 'bad')); }
    else rows.push(row('🧮', `Solde ${getCongeTypeLabel(type)} ${year} : <b>${quota - taken} j</b> → <b>${after} j</b> après ce congé.`));
  }
  const clash = state.conges.find(c => c.start <= end && c.end >= start);
  if (clash) { ok = false; rows.push(row('⛔', `Chevauche un congé déjà posé (${getCongeTypeLabel(clash.type)} du ${clash.start} au ${clash.end}).`, 'bad')); }

  const cfg = getBTPConfig();
  if (cfg.enabled && type === 'cp') {
    const py = getBTPPriseYear(new Date(start + 'T00:00:00'));
    const before = getBTPFractionnementInfo(py);
    state.conges.push({ type: 'cp', start, end, days, ...(unit ? { unit } : {}), id: -1 });
    let after;
    try { after = getBTPFractionnementInfo(py); } finally { state.conges.pop(); }
    const dBonus = after.bonusDays - before.bonusDays;
    if (dBonus > 0) rows.push(row('🎁', `Fractionnement : ce congé te donnerait <b>+${dBonus} jour${dBonus > 1 ? 's' : ''}</b> supplémentaire${dBonus > 1 ? 's' : ''} (estimation CIBTP).`));
    else if (after.outsidePeriod > before.outsidePeriod && !after.continuous) rows.push(row('ℹ️', 'Fractionnement : il faut aussi 12 jours ouvrables continus pris avant le 1er novembre pour ouvrir ce droit.', 'warn'));
    else if (after.outsidePeriod > before.outsidePeriod) rows.push(row('ℹ️', `Fractionnement : ${after.relevantOutside} j pris hors période (1er nov.–30 avr.) hors 5e semaine ; il en faut au moins 3 pour gagner 1 jour.`));
    const dl = getBTPDeadlines(cfg);
    const year = Number(start.slice(0, 4));
    const left = Math.max(0, getEffectiveQuotaForYear('cp', year) - getCongesTakenForYear('cp', year) - days);
    if (left > 0 && start <= dl.cinquiemeSemaineEnd) rows.push(row('🏗️', `Il te resterait <b>${left} j</b> de CP à poser avant le ${fmtDateFR(dl.cinquiemeSemaineEnd)} (échéance de la 5e semaine, ${cfg.statut === 'ouvrier' ? 'ouvrier' : 'ETAM/cadre'}).`, left > 6 ? 'warn' : ''));
  }
  out.innerHTML = rows.join('') + (ok
    ? `<button class="btn-add-conge" style="margin-top:10px" onclick="simPoser()">Poser ce congé</button>`
    : '');
}
function simPoser() {
  document.getElementById('congeType').value = document.getElementById('simType').value;
  document.getElementById('congeStart').value = document.getElementById('simStart').value;
  document.getElementById('congeEnd').value = document.getElementById('simEnd').value || document.getElementById('simStart').value;
  addConge();
  document.getElementById('simResult').innerHTML = '';
  document.getElementById('simStart').value = '';
  document.getElementById('simEnd').value = '';
}
(function hookCongesRender() {
  const orig = renderConges;
  renderConges = function () { const r = orig.apply(this, arguments); try { syncSimTypes(); } catch (e) {} return r; };
})();

// ── 13. SAUVEGARDE HEBDOMADAIRE ─────────────────────────────
// (fonctions dans 10-interface-init.js : checkAutoBackup, confirmAutoBackup, renderBackupDueBanner, shareOrDownloadBackup)
setInterval(checkEndOfDay, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkEndOfDay(); checkAutoBackup(); } });
setTimeout(checkEndOfDay, 1500);

// ── GRAND ANNEAU DE PROGRESSION (écran Aujourd'hui) ─────────
function updateRing() {
  const prog = document.getElementById('ringProg');
  const svg = document.getElementById('ringSvg');
  const sub = document.getElementById('ringSub');
  if (!prog || !svg) return;
  const now = new Date();
  let done = state.sessions.filter(s => s.date === todayKey()).reduce((a, s) => a + (s.net || 0), 0);
  if (isDateOnRTT(toLocalISO(now))) done += getGoalForDow(now.getDay());
  if (state.status !== 'idle' && state.startTs) {
    let pause = state.totalPauseMs;
    if (state.status === 'paused' && state.pauseStart) pause += now.getTime() - state.pauseStart;
    done += Math.max(0, now.getTime() - state.startTs - pause);
  }
  const goal = getGoalForDow(now.getDay());
  const pct = goal > 0 ? done / goal : 0;
  const R = 112, C = 2 * Math.PI * R;
  prog.style.strokeDashoffset = (C * (1 - Math.min(1, pct))).toFixed(1);
  svg.classList.toggle('paused', state.status === 'paused');
  if (sub) {
    sub.textContent = goal > 0
      ? (pct >= 1 ? 'objectif atteint 🎉' : `${fmtHM(done)} sur ${fmtHM(goal)} · ${Math.round(pct * 100)} %`)
      : (done > 0 ? fmtHM(done) + ' aujourd\'hui' : '');
  }
}
(function hookRing() {
  const t = tick; tick = function () { const r = t.apply(this, arguments); try { updateRing(); } catch (e) {} return r; };
  const rt = renderToday; renderToday = function () { const r = rt.apply(this, arguments); try { updateRing(); } catch (e) {} return r; };
})();
updateRing();

// ── SECTIONS AFFICHÉES SUR LA PAGE AUJOURD'HUI ──────────────
const HOME_SECTIONS = { objectifs: 'homeSecObjectifs', overtime: 'homeSecOvertime', remuneration: 'homeSecRemuneration' };
const HOME_SECTION_CHECKS = { objectifs: 'homeShowObjectifs', overtime: 'homeShowOvertime', remuneration: 'homeShowRemuneration' };
function getHomeSections() {
  const def = { objectifs: true, overtime: true, remuneration: true };
  try { return Object.assign(def, JSON.parse(localStorage.getItem('orvia_home_sections') || '{}')); } catch (e) { return def; }
}
function applyHomeSections() {
  const c = getHomeSections();
  Object.keys(HOME_SECTIONS).forEach(k => {
    const el = document.getElementById(HOME_SECTIONS[k]);
    if (el) el.style.display = c[k] === false ? 'none' : '';
    const chk = document.getElementById(HOME_SECTION_CHECKS[k]);
    if (chk) chk.checked = c[k] !== false;
  });
}
function onHomeSectionToggle(key, on) {
  const c = getHomeSections(); c[key] = !!on;
  localStorage.setItem('orvia_home_sections', JSON.stringify(c));
  applyHomeSections();
}
applyHomeSections();

// ═══ ANIMATIONS & RETOUR HAPTIQUE (v2.8) ═══════════════════
function hapticsOn() { return localStorage.getItem('orvia_haptics') !== '0'; }
function onHapticsToggle(on) { localStorage.setItem('orvia_haptics', on ? '1' : '0'); if (on) haptic('medium'); showToast(on ? 'Retour haptique activé' : 'Retour haptique désactivé'); }
// iOS 17.4+ : basculer un <input type="checkbox" switch> déclenche un retour haptique natif.
// Android et autres : navigator.vibrate. Sans effet ailleurs.
let _hapticLabel = null;
function haptic(kind) {
  if (!hapticsOn()) return;
  try {
    if (!_hapticLabel) {
      const l = document.createElement('label');
      l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', '');
      l.appendChild(i); document.body.appendChild(l); _hapticLabel = l;
    }
    _hapticLabel.click();
    if (navigator.vibrate && !/iPhone|iPad/.test(navigator.userAgent)) navigator.vibrate(kind === 'medium' ? 22 : kind === 'double' ? [18, 40, 18] : 10);
    if (kind === 'double') setTimeout(() => { try { _hapticLabel.click(); } catch (e) {} }, 90);
  } catch (e) {}
}
(function hookHaptics() {
  const hm = handleMainBtn; handleMainBtn = function () { const was = state.status; const r = hm.apply(this, arguments); haptic(was === 'idle' ? 'medium' : 'light'); return r; };
  const ss = stopSession; stopSession = function () { const r = ss.apply(this, arguments); haptic('double'); return r; };
  const st = switchTab; switchTab = function (n) { const r = st.apply(this, arguments); haptic('light'); return r; };
})();
(function initHapticsToggle() { const c = document.getElementById('hapticsEnabled'); if (c) c.checked = hapticsOn(); })();

// Chrono : seuls les chiffres qui changent défilent.
(function rollingClock() {
  const el = document.getElementById('bigTime');
  if (!el || !window.MutationObserver) return;
  let prev = el.textContent;
  const build = (txt) => {
    const changed = [];
    for (let i = 0; i < txt.length; i++) changed.push(prev.length === txt.length ? prev[i] !== txt[i] : false);
    const nbChanged = changed.filter(Boolean).length;
    const animate = nbChanged > 0 && nbChanged <= 3;
    el.dataset.v = txt;
    el.innerHTML = [...txt].map((ch, i) => `<span class="dg${animate && changed[i] ? ' roll' : ''}">${ch}</span>`).join('');
    prev = txt;
  };
  const mo = new MutationObserver(() => {
    const txt = el.textContent;
    if (el.dataset.v === txt) return;
    build(txt);
  });
  mo.observe(el, { childList: true, characterData: true, subtree: true });
})();

// Anneau : effet quand l'objectif est franchi
(function hookRingReached() {
  const u = updateRing; let was = false, first = true;
  updateRing = function () {
    u.apply(this, arguments);
    const svg = document.getElementById('ringSvg'); const sub = document.getElementById('ringSub');
    const reached = !!(sub && sub.textContent.indexOf('objectif atteint') === 0);
    if (first) { first = false; was = reached; return; }
    if (svg) { if (reached && !was) { svg.classList.remove('reached'); void svg.getBoundingClientRect(); svg.classList.add('reached'); haptic('double'); } if (!reached) svg.classList.remove('reached'); }
    was = reached;
  };
})();

// ═══ STATISTIQUES DE L'ANNÉE ═══════════════════════════════
let _ys = { mode: 'cal', year: new Date().getFullYear() };
const YS_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const YS_MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const YS_DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function openYearStats() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-yearstats').classList.add('active');
  const tabs = document.querySelectorAll('.tab'); if (tabs[1]) tabs[1].classList.add('active');
  renderYearStats();
}
function setYearStatsMode(m) { _ys.mode = m; renderYearStats(); }
function yearStatsStep(d) { _ys.year += d; renderYearStats(); }

function ysHours(ms) { const h = ms / 3600000; return h >= 100 ? Math.round(h) + ' h' : (Math.round(h * 10) / 10).toString().replace('.', ',') + ' h'; }

function ysRange() {
  const now = new Date();
  if (_ys.mode === 'roll') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end, months: Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1)) };
  }
  return { start: new Date(_ys.year, 0, 1), end: new Date(_ys.year + 1, 0, 1), months: Array.from({ length: 12 }, (_, i) => new Date(_ys.year, i, 1)) };
}

function ysBarChart(title, sub, items, opts) {
  opts = opts || {};
  const W = 340, H = opts.h || 150, padB = 20, padT = 16;
  const n = items.length, gap = opts.gap == null ? 6 : opts.gap, bw = (W - gap * (n - 1)) / n;
  const maxV = Math.max(1, ...items.map(i => i.v));
  const ch = H - padB - padT;
  const avgY = opts.avg != null ? padT + ch - (opts.avg / maxV) * ch : null;
  const maxIdx = items.reduce((m, it, i) => (it.v > items[m].v ? i : m), 0);
  const bars = items.map((it, i) => {
    const h = Math.max(it.v > 0 ? 2 : 0, (it.v / maxV) * ch);
    const x = i * (bw + gap), y = padT + ch - h;
    const cls = 'ys-bar' + (i === maxIdx && it.v > 0 ? ' max' : it.cur ? ' cur' : '');
    const lab = opts.valueLabels && it.v > 0 ? `<text class="ys-t${i === maxIdx ? ' b' : ''}" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${it.lbl2 || Math.round(it.v / 3600000)}</text>` : '';
    const showX = !opts.xEvery || i % opts.xEvery === 0;
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(5, bw / 2)}" style="animation-delay:${i * 25}ms"><title>${it.tip || ''}</title></rect>${lab}${showX ? `<text class="ys-t" x="${i === 0 && opts.gap < 3 ? 0 : x + bw / 2}" y="${H - 5}" text-anchor="${i === 0 && opts.gap < 3 ? 'start' : 'middle'}">${it.x}</text>` : ''}`;
  }).join('');
  const avg = avgY != null ? `<line class="ys-avg" x1="0" x2="${W}" y1="${avgY.toFixed(1)}" y2="${avgY.toFixed(1)}"/>` : '';
  return `<div class="settings-card ys-chart"><h3>${title}</h3><div class="sub">${sub}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${avg}${bars}</svg>${opts.avg != null ? `<div class="ys-legend"><span><i></i>${opts.avgLabel}</span></div>` : ''}</div>`;
}

function renderYearStats() {
  const calBtn = document.getElementById('ysModeCal'), rollBtn = document.getElementById('ysModeRoll');
  if (calBtn) calBtn.classList.toggle('active', _ys.mode === 'cal');
  if (rollBtn) rollBtn.classList.toggle('active', _ys.mode === 'roll');
  const nav = document.getElementById('ysNav'); if (nav) nav.style.display = _ys.mode === 'cal' ? '' : 'none';
  const { start, end, months } = ysRange();
  document.getElementById('ysTitle').textContent = _ys.mode === 'cal' ? String(_ys.year) : '12 derniers mois';
  const sessions = state.sessions.filter(s => s.start >= start.getTime() && s.start < end.getTime());
  const body = document.getElementById('ysBody');
  if (!sessions.length) { body.innerHTML = '<div class="empty"><div class="emoji">📊</div>Aucune session sur cette période</div>'; return; }

  // agrégats
  const byDay = {}, byMonth = months.map(() => 0), byWeek = {};
  sessions.forEach(s => {
    const d = new Date(s.start), dk = tsToDateInput(s.start);
    byDay[dk] = (byDay[dk] || 0) + (s.net || 0);
    const mi = months.findIndex(m => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth());
    if (mi >= 0) byMonth[mi] += s.net || 0;
    const wk = tsToDateInput(getMondayOf(d).getTime());
    byWeek[wk] = (byWeek[wk] || 0) + (s.net || 0);
  });
  const total = sessions.reduce((a, s) => a + (s.net || 0), 0);
  const days = Object.keys(byDay).length;
  const weeksArr = Object.keys(byWeek).sort();
  const avgWeek = total / Math.max(1, weeksArr.length);
  const avgDay = total / Math.max(1, days);
  const bestMonthIdx = byMonth.reduce((m, v, i) => (v > byMonth[m] ? i : m), 0);
  const bm = months[bestMonthIdx];
  const longestKey = Object.keys(byDay).reduce((m, k) => (byDay[k] > byDay[m] ? k : m), Object.keys(byDay)[0]);
  const longestD = new Date(longestKey + 'T00:00:00');
  const bestWeekKey = weeksArr.reduce((m, k) => (byWeek[k] > byWeek[m] ? k : m), weeksArr[0]);
  const bwD = new Date(bestWeekKey + 'T00:00:00');

  const card = (k, v, sub, hl) => `<div class="settings-card ys-card${hl ? ' hl' : ''}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub || ''}</div></div>`;
  const cards = `<div class="ys-grid">
    ${card('Total', ysHours(total), days + ' jour' + (days > 1 ? 's' : '') + ' travaillé' + (days > 1 ? 's' : ''), true)}
    ${card('Moyenne / semaine', ysHours(avgWeek), weeksArr.length + ' semaine' + (weeksArr.length > 1 ? 's' : '') + ' avec activité')}
    ${card('Mois le plus chargé', YS_MONTHS_LONG[bm.getMonth()].replace(/^./, c => c.toUpperCase()), ysHours(byMonth[bestMonthIdx]) + (_ys.mode === 'roll' ? ' · ' + bm.getFullYear() : ''))}
    ${card('Journée moyenne', ysHours(avgDay), 'sur les jours travaillés')}
    ${card('Journée la plus longue', ysHours(byDay[longestKey]), longestD.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}
    ${card('Semaine la plus chargée', ysHours(byWeek[bestWeekKey]), 'du ' + bwD.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}
  </div>`;

  // graphique 12 mois
  const nowM = new Date();
  const monthItems = months.map((m, i) => ({
    v: byMonth[i], x: YS_MONTHS[m.getMonth()], cur: m.getFullYear() === nowM.getFullYear() && m.getMonth() === nowM.getMonth(),
    tip: YS_MONTHS_LONG[m.getMonth()] + ' ' + m.getFullYear() + ' : ' + ysHours(byMonth[i]),
  }));
  const activeMonths = byMonth.filter(v => v > 0);
  const avgMonth = activeMonths.length ? activeMonths.reduce((a, b) => a + b, 0) / activeMonths.length : 0;
  const c1 = ysBarChart('Évolution sur 12 mois', 'Heures travaillées par mois (en heures)', monthItems, { valueLabels: true, avg: avgMonth, avgLabel: 'Moyenne mensuelle : ' + ysHours(avgMonth), gap: 5 });

  // graphique semaines
  const weekItems = [];
  const w0 = getMondayOf(start);
  for (let d = new Date(w0); d < end; d.setDate(d.getDate() + 7)) {
    const k = tsToDateInput(d.getTime());
    weekItems.push({ v: byWeek[k] || 0, x: weekItems.length % 8 === 0 ? (d.getDate() + ' ' + YS_MONTHS[d.getMonth()]) : '', tip: 'Semaine du ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) + ' : ' + ysHours(byWeek[k] || 0) });
  }
  const c2 = ysBarChart('Heures par semaine', 'Chaque barre est une semaine', weekItems, { avg: avgWeek, avgLabel: 'Moyenne : ' + ysHours(avgWeek), gap: 1.5, h: 130 });

  // jours de la semaine
  const dowSum = [0, 0, 0, 0, 0, 0, 0], dowN = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(byDay).forEach(k => { const i = (new Date(k + 'T00:00:00').getDay() + 6) % 7; dowSum[i] += byDay[k]; dowN[i]++; });
  const dowItems = YS_DOW.map((l, i) => { const a = dowN[i] ? dowSum[i] / dowN[i] : 0; return { v: a, x: l, lbl2: a ? (Math.round(a / 360000) / 10).toString().replace('.', ',') : '', tip: l + ' : ' + ysHours(a) + ' en moyenne' }; });
  const c3 = ysBarChart('Journée type', 'Durée moyenne selon le jour de la semaine (en heures)', dowItems, { valueLabels: true, gap: 10, h: 130 });

  body.innerHTML = cards + c1 + c2 + c3;
}
