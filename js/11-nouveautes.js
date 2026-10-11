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
