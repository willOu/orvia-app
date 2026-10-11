// ── GÉOFENCING AUTOMATIQUE ──
// Démarre/termine le chrono en entrant/sortant des zones définies (lieu de
// travail + zone secondaire optionnelle). Fonctionne uniquement app ouverte
// au premier plan : aucune Geolocation API web ne permet de surveiller une
// zone en arrière-plan comme le ferait une app native (limitation du
// navigateur, pas d'Orvia).
function getGeofenceConfig() {
  try {
    const raw = localStorage.getItem('orvia_geofence_config');
    if (!raw) return { enabled: false, confirmBeforeAction: true, zone2Lat: null, zone2Lng: null, zone2Label: '' };
    const p = JSON.parse(raw);
    return {
      enabled: !!p.enabled,
      confirmBeforeAction: p.confirmBeforeAction !== false,
      zone2Lat: (p.zone2Lat !== null && p.zone2Lat !== undefined && Number.isFinite(Number(p.zone2Lat))) ? Number(p.zone2Lat) : null,
      zone2Lng: (p.zone2Lng !== null && p.zone2Lng !== undefined && Number.isFinite(Number(p.zone2Lng))) ? Number(p.zone2Lng) : null,
      zone2Label: typeof p.zone2Label === 'string' ? p.zone2Label.slice(0, 60) : ''
    };
  } catch (e) {
    return { enabled: false, confirmBeforeAction: true, zone2Lat: null, zone2Lng: null, zone2Label: '' };
  }
}

function saveGeofenceConfig(cfg) {
  localStorage.setItem('orvia_geofence_config', JSON.stringify(cfg));
}

let geofenceWatchId = null;
let geofenceInsideZone = null;
let geofencePendingAction = null;
const GEOFENCE_ACTION_DELAY_MS = 15000;

function renderGeofenceSettings() {
  const cfg = getGeofenceConfig();
  const enabledEl = document.getElementById('geofenceEnabled');
  const confirmEl = document.getElementById('geofenceConfirm');
  const confirmCard = document.getElementById('geofenceConfirmCard');
  const statusCard = document.getElementById('geofenceStatusCard');
  const zone2Label = document.getElementById('geofenceZone2Label');
  if (enabledEl) enabledEl.checked = cfg.enabled;
  if (confirmEl) confirmEl.checked = cfg.confirmBeforeAction;
  if (confirmCard) confirmCard.style.display = cfg.enabled ? 'block' : 'none';
  if (statusCard) statusCard.style.display = cfg.enabled ? 'block' : 'none';
  if (zone2Label) {
    zone2Label.textContent = (cfg.zone2Lat !== null && cfg.zone2Lng !== null)
      ? (cfg.zone2Label || `${cfg.zone2Lat.toFixed(5)}, ${cfg.zone2Lng.toFixed(5)}`)
      : 'Non défini';
  }
  updateGeofenceStatusLabel();
}

function updateGeofenceStatusLabel() {
  const el = document.getElementById('geofenceStatusLabel');
  if (!el) return;
  const cfg = getGeofenceConfig();
  if (!cfg.enabled) { el.textContent = 'Surveillance inactive'; return; }
  if (!geofenceWatchId) { el.textContent = 'En attente d\'autorisation de localisation…'; return; }
  if (geofenceInsideZone === null) { el.textContent = 'Localisation en cours…'; return; }
  el.textContent = geofenceInsideZone
    ? '🟢 Dans une zone surveillée'
    : '⚪ Hors zone';
}

function onGeofenceToggle() {
  const cfg = getGeofenceConfig();
  const enabledEl = document.getElementById('geofenceEnabled');
  cfg.enabled = enabledEl ? enabledEl.checked : false;
  saveGeofenceConfig(cfg);
  if (cfg.enabled) startGeofenceWatch(); else stopGeofenceWatch();
  renderGeofenceSettings();
  showToast(cfg.enabled ? 'Géofencing activé ✓' : 'Géofencing désactivé');
}

function onGeofenceConfirmToggle() {
  const cfg = getGeofenceConfig();
  const confirmEl = document.getElementById('geofenceConfirm');
  cfg.confirmBeforeAction = confirmEl ? confirmEl.checked : true;
  saveGeofenceConfig(cfg);
}

async function captureGeofenceZone2() {
  showToast('Localisation en cours… 📍');
  const geo = await getGeo();
  if (!geo) { showToast("Impossible d'obtenir votre position"); return; }
  const cfg = getGeofenceConfig();
  cfg.zone2Lat = Number(geo.lat);
  cfg.zone2Lng = Number(geo.lng);
  cfg.zone2Label = geo.label || '';
  saveGeofenceConfig(cfg);
  renderGeofenceSettings();
  showToast('Zone secondaire enregistrée ✓');
}

function clearGeofenceZone2() {
  const cfg = getGeofenceConfig();
  cfg.zone2Lat = null;
  cfg.zone2Lng = null;
  cfg.zone2Label = '';
  saveGeofenceConfig(cfg);
  renderGeofenceSettings();
  showToast('Zone secondaire effacée');
}

function isInsideAnyGeofenceZone(lat, lng) {
  const workCfg = getWorkModeConfig();
  const geoCfg = getGeofenceConfig();
  const zones = [];
  if (workCfg.lat !== null && workCfg.lng !== null) zones.push({ lat: workCfg.lat, lng: workCfg.lng, radiusM: workCfg.radiusM });
  if (geoCfg.zone2Lat !== null && geoCfg.zone2Lng !== null) zones.push({ lat: geoCfg.zone2Lat, lng: geoCfg.zone2Lng, radiusM: workCfg.radiusM });
  return zones.some(z => distanceMeters(lat, lng, z.lat, z.lng) <= z.radiusM);
}

function startGeofenceWatch() {
  if (geofenceWatchId !== null) return;
  if (!navigator.geolocation) { showToast('Géolocalisation non disponible sur cet appareil'); return; }
  geofenceWatchId = navigator.geolocation.watchPosition(
    pos => handleGeofencePosition(pos.coords.latitude, pos.coords.longitude),
    () => { updateGeofenceStatusLabel(); },
    { enableHighAccuracy: false, maximumAge: 20000, timeout: 15000 }
  );
  updateGeofenceStatusLabel();
}

function stopGeofenceWatch() {
  if (geofenceWatchId !== null) {
    navigator.geolocation.clearWatch(geofenceWatchId);
    geofenceWatchId = null;
  }
  geofenceInsideZone = null;
  if (geofencePendingAction) {
    clearTimeout(geofencePendingAction.timerId);
    geofencePendingAction = null;
  }
  updateGeofenceStatusLabel();
}

function handleGeofencePosition(lat, lng) {
  const inside = isInsideAnyGeofenceZone(lat, lng);
  if (geofenceInsideZone === inside) { updateGeofenceStatusLabel(); return; }
  geofenceInsideZone = inside;
  updateGeofenceStatusLabel();

  if (inside && state.status === 'idle') {
    triggerGeofenceAction('start');
  } else if (!inside && state.status !== 'idle') {
    triggerGeofenceAction('stop');
  }
}

function triggerGeofenceAction(type) {
  if (geofencePendingAction) return;
  const cfg = getGeofenceConfig();
  const label = type === 'start' ? 'Démarrage automatique de la session (zone détectée)' : 'Fin automatique de la session (sortie de zone)';

  if (!cfg.confirmBeforeAction) {
    executeGeofenceAction(type);
    return;
  }

  showUndoToast(
    label,
    () => { geofencePendingAction = null; showToast('Action annulée'); },
    () => { executeGeofenceAction(type); }
  );
  // showUndoToast() assigne son propre timer à _undoDeleteTimer de façon
  // synchrone : on le récupère ici pour pouvoir vraiment l'annuler depuis
  // stopGeofenceWatch() si le géofencing est désactivé pendant le compte à rebours.
  geofencePendingAction = { type, timerId: _undoDeleteTimer };
}

function executeGeofenceAction(type) {
  geofencePendingAction = null;
  if (type === 'start' && state.status === 'idle') {
    handleMainBtn();
    showToast('Session démarrée automatiquement (géofencing) 📍');
  } else if (type === 'stop' && state.status !== 'idle') {
    stopSession();
    showToast('Session terminée automatiquement (géofencing) 📍');
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const cfg = getGeofenceConfig();
  if (cfg.enabled && geofenceWatchId === null) startGeofenceWatch();
});

function openShortcutsSettings() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-shortcuts-settings').classList.add('active');
  const base = baseAppUrl();
  document.getElementById('shortcutUrlStart').value = base + '?action=start';
  document.getElementById('shortcutUrlPause').value = base + '?action=pause';
  document.getElementById('shortcutUrlStop').value = base + '?action=stop';
  const stopHomeEl = document.getElementById('shortcutUrlStopHome');
  if (stopHomeEl) stopHomeEl.value = base + '?action=stop';
  const toggleEl = document.getElementById('shortcutUrlToggle');
  if (toggleEl) toggleEl.value = base + '?action=pause';
  const notifEl = document.getElementById('shortcutNotifEnabled');
  if (notifEl) notifEl.checked = getShortcutNotifEnabled();
}

// Préférence "Notifications de confirmation" pour les actions déclenchées
// via URL (?action=start/stop/pause), utile quand l'app est fermée/arrière-plan
// au moment du déclenchement par une automatisation externe.
function getShortcutNotifEnabled() {
  return localStorage.getItem('orvia_shortcut_notif') === '1';
}

function onShortcutNotifToggle() {
  const el = document.getElementById('shortcutNotifEnabled');
  const enabled = el ? el.checked : false;
  localStorage.setItem('orvia_shortcut_notif', enabled ? '1' : '0');
  if (enabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  showToast(enabled ? 'Notifications de confirmation activées ✓' : 'Notifications de confirmation désactivées');
}

// Affiche une notification native confirmant qu'une action déclenchée par URL
// (automatisation/raccourci) a bien été traitée. Échoue silencieusement si la
// permission n'est pas accordée ou si le réglage est désactivé, sans jamais
// bloquer l'action elle-même.
function notifyShortcutActionResult(message) {
  try {
    if (!getShortcutNotifEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    orviaNotify('Orvia', { body: message });
  } catch (e) {}
}

function copyShortcutUrl(action) {
  const url = baseAppUrl() + '?action=' + action;
  const done = () => showToast('URL copiée ✓');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopyShortcutUrl(action, done));
  } else {
    fallbackCopyShortcutUrl(action, done);
  }
}

function fallbackCopyShortcutUrl(action, done) {
  const input = document.getElementById('shortcutUrl' + action.charAt(0).toUpperCase() + action.slice(1));
  if (!input) return;
  input.select();
  input.setSelectionRange(0, 99999);
  try { document.execCommand('copy'); done(); } catch (e) { showToast("Impossible de copier, sélectionnez l'URL manuellement"); }
}

function openAboutSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-about-settings').classList.add('active');
    renderAboutVersion();             const vbt=document.getElementById('versionBadgeTop');             if(vbt)vbt.textContent='v'+APP_VERSION;
  }

  function openOvertimeSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-overtime-settings').classList.add('active');
    renderOvertimeCardInto('overtimeCardSettings');
    renderRecuperationsList();
  }

  function openRemunerationSettings() {    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('page-remuneration-settings').classList.add('active');
    const enabledEl = document.getElementById('remunerationEnabled');
    const tauxEl = document.getElementById('tauxHoraireInput');
    const seuil1El = document.getElementById('seuil1Input');
    const seuil2El = document.getElementById('seuil2Input');
    const maj1El = document.getElementById('majorationTranche1Input');
    const maj2El = document.getElementById('majorationTranche2Input');
    const netEnabledEl = document.getElementById('netEnabledInput');
    const tauxImpEl = document.getElementById('tauxImpositionInput');
    if (enabledEl) enabledEl.checked = remuneration.enabled;
    if (tauxEl) tauxEl.value = remuneration.tauxHoraire || '';
    if (seuil1El) seuil1El.value = remuneration.seuil1;
    if (seuil2El) seuil2El.value = remuneration.seuil2;
    if (maj1El) maj1El.value = remuneration.majorationTranche1;
    if (maj2El) maj2El.value = remuneration.majorationTranche2;
    if (netEnabledEl) netEnabledEl.checked = remuneration.netEnabled;
       const remuSupEl = document.getElementById('remuSupEnabledInput');
    if (remuSupEl) remuSupEl.checked = remuneration.remuSupEnabled !== false;
    if (tauxImpEl) tauxImpEl.value = remuneration.tauxImposition;
    updateRemunerationLabels();
    renderTauxHoraireHistoList();
  }

  function onNetEnabledToggle() {
    const el = document.getElementById('netEnabledInput');
    remuneration.netEnabled = el ? el.checked : false;
    saveRemuneration();
    renderToday();
    showToast(remuneration.netEnabled ? 'Estimation du net activée' : 'Estimation du net désactivée');
  }

  function onTauxImpositionChange() {
    const el = document.getElementById('tauxImpositionInput');
    const val = clampNumber(Number(el ? el.value : 22), 0, 100, 22);
    remuneration.tauxImposition = val;
    saveRemuneration();
    renderToday();
    showToast('Taux d\'imposition mis à jour');
  }

  function updateRemunerationLabels() {
    const l1 = document.getElementById('labelTranche1');
    const l2 = document.getElementById('labelTranche2');
    if (l1) l1.textContent = `Majoration tranche ${remuneration.seuil1}h–${remuneration.seuil2}h (%)`;
    if (l2) l2.textContent = `Majoration au-delà de ${remuneration.seuil2}h (%)`;
  }

  function onRemunerationToggle() {
    const enabledEl = document.getElementById('remunerationEnabled');
    remuneration.enabled = enabledEl ? enabledEl.checked : false;
    saveRemuneration();
    renderToday();
    showToast(remuneration.enabled ? 'Rémunération activée' : 'Rémunération désactivée');
  }

  function onTauxHoraireChange() {
    const tauxEl = document.getElementById('tauxHoraireInput');
    const val = clampNumber(Number(tauxEl ? tauxEl.value : 0), 0, 1000, 0);
    remuneration.tauxHoraire = val;
    saveRemuneration();
    if (val > 0) recordCurrentTauxIfChanged(val);
    renderToday();
    showToast('Taux horaire mis à jour');
  }

  function onSeuil1Change() {
    const el = document.getElementById('seuil1Input');
    const val = clampNumber(Number(el ? el.value : 35), 0, 80, 35);
    remuneration.seuil1 = val;
    if (remuneration.seuil2 <= remuneration.seuil1) {
      remuneration.seuil2 = remuneration.seuil1 + 1;
      const seuil2El = document.getElementById('seuil2Input');
      if (seuil2El) seuil2El.value = remuneration.seuil2;
    }
    saveRemuneration();
    updateRemunerationLabels();
    renderToday();
    showToast('Seuil mis à jour');
  }

  function onSeuil2Change() {
    const el = document.getElementById('seuil2Input');
    const val = clampNumber(Number(el ? el.value : 39), 0, 80, 39);
    remuneration.seuil2 = Math.max(val, remuneration.seuil1 + 1);
     if (el) el.value = remuneration.seuil2;
    saveRemuneration();
    updateRemunerationLabels();
    renderToday();
    showToast('Seuil mis à jour');
  }

   function onRemuSupToggle() {
    const el = document.getElementById('remuSupEnabledInput');
    remuneration.remuSupEnabled = el ? el.checked : true;
    saveRemuneration();
    renderToday();
    showToast(remuneration.remuSupEnabled ? 'Calcul >39h activé' : 'Calcul >39h désactivé');
  }

  function onMajorationTranche1Change() {
    const el = document.getElementById('majorationTranche1Input');
    const val = clampNumber(Number(el ? el.value : 25), 0, 200, 25);
    remuneration.majorationTranche1 = val;
    saveRemuneration();
    renderToday();
    showToast('Majoration mise à jour');
  }

  function onMajorationTranche2Change() {
    const el = document.getElementById('majorationTranche2Input');
    const val = clampNumber(Number(el ? el.value : 50), 0, 200, 50);
    remuneration.majorationTranche2 = val;
    saveRemuneration();
    renderToday();
    showToast('Majoration mise à jour');
  }
  function openArrondiSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-arrondi-settings').classList.add('active');
    const enabledEl = document.getElementById('arrondiEnabled');
    const minutesEl = document.getElementById('arrondiMinutesSelect');
    const modeEl = document.getElementById('arrondiModeSelect');
    if (enabledEl) enabledEl.checked = arrondi.enabled;
    if (minutesEl) minutesEl.value = String(arrondi.minutes);
    if (modeEl) modeEl.value = arrondi.mode;
  }

  function onArrondiEnabledToggle() {
    const el = document.getElementById('arrondiEnabled');
    arrondi.enabled = el ? el.checked : false;
    saveArrondi();
    showToast(arrondi.enabled ? 'Arrondi activé' : 'Arrondi désactivé');
  }

  function onArrondiMinutesChange() {
    const el = document.getElementById('arrondiMinutesSelect');
    const val = Number(el ? el.value : 15);
    arrondi.minutes = [5, 10, 15, 30].includes(val) ? val : 15;
    saveArrondi();
    showToast('Précision mise à jour');
  }

  function onArrondiModeChange() {
    const el = document.getElementById('arrondiModeSelect');
    const val = el ? el.value : 'nearest';
    arrondi.mode = ['nearest', 'favor_salarie', 'favor_entreprise'].includes(val) ? val : 'nearest';
    saveArrondi();
    showToast('Mode mis à jour');
  }
  function openInactiviteSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-inactivite-settings').classList.add('active');
    const enabledEl = document.getElementById('inactiviteEnabled');
    const seuilEl = document.getElementById('inactiviteSeuilSelect');
    if (enabledEl) enabledEl.checked = inactivite.enabled;
    if (seuilEl) seuilEl.value = String(inactivite.seuilHeures);
  }

  function onInactiviteEnabledToggle() {
    const el = document.getElementById('inactiviteEnabled');
    inactivite.enabled = el ? el.checked : false;
    saveInactivite();
    showToast(inactivite.enabled ? 'Détection activée' : 'Détection désactivée');
  }

  function onInactiviteSeuilChange() {
    const el = document.getElementById('inactiviteSeuilSelect');
    const val = Number(el ? el.value : 12);
    inactivite.seuilHeures = [6, 10, 12, 16, 20].includes(val) ? val : 12;
    saveInactivite();
    showToast('Seuil mis à jour');
  }
  function onResumeJourToggle() {
    const el = document.getElementById('resumeJourEnabled');
    resumeJour.enabled = el ? el.checked : false;
    saveResumeJour();
    showToast(resumeJour.enabled ? 'Résumé du jour activé' : 'Résumé du jour désactivé');
  }




  function renderAboutVersion() {
    const el = document.getElementById('aboutVersionLabel');
    if (el) el.textContent = 'v' + APP_VERSION;
  }

  const CHANGELOG = [
    { version: '2.3.2', date: '2026-10-11', items: ['Correctif : Barre d\u2019onglets opaque, plus de texte qui transparaît'] },
    { version: '2.3.1', date: '2026-10-11', items: ['Correctif : Suppression du flou en haut et en bas de l\u2019écran (Liquid Glass)'] },
    { version: '2.3.0', date: '2026-10-11', items: ['Nouveauté : Refonte du design en Liquid Glass (verre dépoli, barre d\u2019onglets flottante)'] },
    { version: '2.2.1', date: '2026-10-10', items: ['Correctif : Congés BTP alignés sur les règles CIBTP (ETAM)'] },
    { version: '2.2.0', date: '2026-10-10', items: ['Nouveauté : Fusion de synchro entre appareils et découpage du code'] },
    { version: '2.1.4', date: '2026-10-10', items: ['Correctif : Correctifs de l\u2019audit (congés par année, sauvegardes, notifications iOS, IR 2026)'] },
    { version: '2.1.3', date: '2026-07-29', items: ['Ajout d\u2019instructions dédiées dans Raccourcis pour utiliser Orvia depuis l\u2019Apple Watch (synchronisation automatique des raccourcis iPhone → Watch, complications, Wear OS via app tierce), et raccourci dédié \u2018Basculer pause/reprise\u2019 pensé pour un tap rapide au poignet.'] },
    { version: '2.1.2', date: '2026-07-28', items: ['Correctif : dans le calendrier des congés, les jours réellement travaillés (sans congé) n\u2019étaient jamais mis en évidence (classe visuelle manquante), à cause d\u2019un enchaînement de conditions mal branché.', 'Correctif : le badge de version en haut de l\u2019écran principal n\u2019existait pas dans la page, alors que le code essayait déjà de le mettre à jour \u2014 il est maintenant bien affiché et cliquable vers \u2019\u00c0 propos\u2019.'] },
    { version: '2.1.1', date: '2026-07-28', items: ['Ajout : possibilité de corriger l\u2019heure d\u2019arrivée directement pendant une session en cours (pastille \u2019Arrivée\u2019 sur l\u2019écran principal), sans attendre la fin de la session pour la corriger via l\u2019historique.'] },
    { version: '2.1.0', date: '2026-07-28', items: ['Ajout : clic direct sur un jour du calendrier des congés pour l\u2019ajouter en un geste (type + note), sans passer par le formulaire complet.', 'Ajout : les RTT posées comptent désormais comme du temps de travail effectif dans le compteur hebdomadaire, les graphiques et le solde d\u2019heures supplémentaires (option la plus sûre côté paie), au lieu de laisser ces jours à 0h.', 'Amélioration : la vue mensuelle de l\u2019historique affiche maintenant une barre de progression et le pourcentage d\u2019objectif atteint, avec le détail des heures RTT incluses dans le total.', 'Ajout : automatisations Raccourcis enrichies avec un guide pour un arrêt automatique du chrono à l\u2019arrivée chez soi (déclencheur natif iOS, fonctionne app fermée), et des notifications de confirmation quand une action est déclenchée via une automatisation externe.'] },
    { version: '2.0.8', date: '2026-07-28', items: ['Correctif : dans les infobulles des graphiques Tendance et Comparaisons, la date, le réalisé et l\u2019objectif étaient quasiment invisibles (texte sombre sur fond sombre), seul l\u2019écart vs objectif ressortait.', 'Correctif : sur le graphique Comparaisons (vue Mois), les 12 étiquettes de mois se chevauchaient et devenaient illisibles (les millésimes \u201925\u2019/\u201926\u2019 de mois adjacents se superposaient). Le nombre d\u2019étiquettes affichées est maintenant limité pour rester lisible.'] },
    { version: '2.0.7', date: '2026-07-28', items: ['Correctif : l\u2019infobulle des graphiques Tendance et Comparaisons pouvait se retrouver plaquée en haut du graphique et chevaucher les barres, faute de place au-dessus du canvas. Elle s\u2019affiche désormais sous le graphique quand la place manque au-dessus.', 'Correctif (iOS) : les boutons Jour/Semaine/Mois/Année (et les autres sélecteurs de vue) pouvaient afficher le bon contenu sans que le cadre actif ne soit visuellement mis en surbrillance, à cause du style natif des boutons sur Safari iOS. Ajout de -webkit-appearance: none.'] },
    { version: '2.0.6', date: '2026-07-27', items: ['Correctif : le géofencing pouvait déclencher un démarrage/arrêt automatique de session même après avoir désactivé la fonction pendant le compte à rebours de confirmation.', 'Correctif : la synchronisation cloud pouvait, dans de rares cas (changements locaux non envoyés + écriture concurrente d\u2019un autre appareil), écraser silencieusement des données locales pas encore synchronisées.', 'Correctif : l\u2019historique des primes et des taux horaires n\u2019était jamais inclus dans les sauvegardes (export local ni synchronisation cloud), ce qui le faisait disparaître lors d\u2019un changement d\u2019appareil.'] },
    { version: '2.0.5', date: '2026-07-27', items: ['Le code de connexion par email repasse à 6 chiffres (validation, champ et placeholder), suite au changement de configuration côté Supabase (longueur d\u2019OTP).'] },
    { version: '2.0.4', date: '2026-07-27', items: ['Correctif : les notes de session pouvaient casser la mise en forme de l\u2019export imprimable (Historique) si elles contenaient des caractères < ou &.', 'Correctif : le calcul de moyenne des primes annuelles ignorait les années sans prime dans le diviseur, ce qui pouvait gonfler artificiellement l\u2019estimation affichée dans le Comparateur augmentation.'] },
    { version: '2.0.3', date: '2026-07-27', items: ['Correctif : le comparateur d\u2019augmentation utilisait le total des primes d\u2019une seule année (au lieu d\u2019une vraie moyenne sur plusieurs années), ce qui pouvait fausser l\u2019estimation du revenu annuel projeté.'] },
    { version: '2.0.2', date: '2026-07-27', items: ['Correction de la mise en surbrillance des vues Historique (Jour/Semaine/Mois/Année) qui pouvait se désynchroniser à cause d\u2019un conflit avec les boutons de la section Comparaisons.', 'Correction du libellé de comparaison mensuelle qui pouvait rester figé sur un jour du mois incorrect au lieu d\u2019afficher le jour réel du mois en cours.'] },
    { version: '2.0.1', date: '2026-07-26', items: ['Correctif : le barème fiscal (tranche à 45%) pouvait être corrompu de façon silencieuse et permanente si sauvegardé, la valeur \u00abInfinity\u00bb n\u2019étant pas conservée par la sérialisation JSON.'] },
    { version: '2.0.0', date: '2026-07-26', items: ['Prévision de fin d\u2019objectif mensuel basée sur le rythme actuel.', 'Courbe de progression pluriannuelle (comparaison année sur année).', 'Heatmap annuelle façon calendrier de contributions.', 'Notifications d\u2019anniversaire de travail.', 'Mode compact pour petits écrans.', 'Simulateur fiscal par tranches réelles (barème progressif).', 'Alerte de seuil de tranche fiscale.', 'Ponts optimisés multi-semaines avec ratio jours gagnés/posés.', 'Détection d\u2019anomalies enrichie (pauses suspectes, seuils configurables).'] },
    { version: '1.9.5', date: '2026-07-19', items: ['Nettoyage complémentaire : légende du calendrier et cases à cocher de l\u2019alerte "congés à risque" affichaient encore Sans solde/Enfant malade (texte en dur, pas nettoyé la première fois).'] },
    { version: '1.9.4', date: '2026-07-19', items: ['Suppression des types de congé "Congé sans solde" et "Enfant malade" (soldes annuels et sélecteur de type) — les congés déjà posés avec ces types ont été supprimés.'] },
    { version: '1.9.3', date: '2026-07-19', items: ['Correction : le code de connexion par email attendait exactement 6 chiffres alors que Supabase est configuré pour envoyer un code à 8 chiffres — le champ accepte maintenant 8 chiffres.'] },
    { version: '1.9.2', date: '2026-07-19', items: ['Correction : le badge de statut de synchronisation (en haut à gauche) était masqué sous la barre d\u2019état de l\u2019iPhone (heure, batterie) ; il est désormais décalé pour tenir compte de l\u2019encoche/Dynamic Island.'] },
    { version: '1.9.1', date: '2026-07-19', items: ['Correction : cliquer sur un jour du calendrier pour ajouter un congé ne basculait plus correctement sur l\u2019onglet Congés (sélecteurs obsolètes).', 'Correction : l\u2019export Excel dédié aux congés utilisait un nom de fonction incorrect et pouvait échouer au téléchargement.'] },
    { version: '1.9.0', date: '2026-07-19', items: ['Bouton \u2018Annuler\u2019 après suppression d\u2019un congé : un toast de 5 secondes permet désormais de restaurer un congé supprimé par erreur, comme c\u2019était déjà le cas pour les sessions.', 'Export dédié pour les congés : nouveaux boutons CSV et Excel qui exportent uniquement les congés (type, dates, jours, note), séparément des sessions de travail.'] },
    { version: '1.8.0', date: '2026-07-19', items: ['Calendrier des congés mis en avant : la légende s\u2019adapte désormais automatiquement aux types de congés personnalisés créés (nom et couleur).', 'La liste textuelle des congés enregistrés est repliée par défaut sous le calendrier visuel, pour mettre en avant la vue mensuelle colorée.'] },
    { version: '1.7.0', date: '2026-07-19', items: ['Types de congés personnalisables : nouvelle modale complète pour créer un type avec un nom et une couleur au choix (palette de 12 couleurs), avec aperçu en temps réel.', 'Ajout d\u2019un bouton \u2018Modifier\u2019 sur les types de congés personnalisés pour changer leur nom ou leur couleur après création.', 'Détection des doublons de nom lors de la création ou modification d\u2019un type de congé personnalisé.'] },
    { version: '1.6.0', date: '2026-07-19', items: ['Réduction des notifications de synchronisation répétées : un seul toast affiché toutes les 30 secondes maximum, même en cas de synchronisation fréquente entre plusieurs appareils.', 'Correction du badge de statut de synchronisation qui pouvait être masqué par la barre d\u2019état sur iPhone (encoche/Dynamic Island).', 'Ajustement de la vérification du code de connexion par email.'] },
    { version: '1.0.0', date: '2026-07-17', items: ['Nouveau bloc Comparaisons dans Historique : graphique mois par mois (12 derniers mois) ou année par année, export du graphique en image PNG, et carte de moyenne du temps de pause par jour travaillé.'] },
    { version: '0.9.0', date: '2026-07-17', items: ['Le graphique de tendance (Historique) compte désormais les jours fériés dans les barres, tout en les distinguant clairement des congés et des jours normaux : un repère coloré en haut de la colonne, une légende dédiée, et un détail dans l\u2019info-bulle au clic (type de jour affiché explicitement).'] },
    { version: '0.8.0', date: '2026-07-17', items: ['Nouveau réglage \u2018Inclure les congés\u2019 dans Exporter les données : ajoute une section congés (type, dates, jours, note) aux exports CSV, Excel et PDF, en plus des sessions.'] },
    { version: '0.7.0', date: '2026-07-16', items: ['Nouvelle alerte 5e semaine (Mode BTP) : notification push et bannière avant la date limite de prise (31 mars ou 30 avril selon le statut), avec délai d\u2019avertissement réglable (15 à 90 jours).'] },
    { version: '0.6.1', date: '2026-07-16', items: ['Ajout d\u2019un dépliant explicatif dans Mode BTP (CIBTP) : fonctionnement de la caisse, période d\u2019acquisition, composition du congé, périodes de prise, calcul du fractionnement et prime de vacances, spécifiques au CIBTP Rhône-Alpes Auvergne.'] },
    { version: '0.6.0', date: '2026-07-16', items: ['Nouveau Mode BTP (CIBTP) dans les réglages des congés : statut ouvrier ou ETAM/cadre réglable (échéance de la 5e semaine), grille de jours d\u2019ancienneté entièrement personnalisable selon ta convention, et calcul automatique des jours de fractionnement (1 ou 2 jours) selon les jours de congé payé pris hors de la période mai-octobre.'] },
    { version: '0.5.1', date: '2026-07-16', items: ['Correction : collision de nom entre l\u2019identifiant HTML et la fonction de suggestion de ponts, qui empêchait leur affichage fiable.', 'Correction : comparaison de dates incohérente (format ISO vs format français) dans le calcul des ponts suggérés.'] },
    { version: '0.5.0', date: '2026-07-16', items: ['Nouveau Planning intelligent dans les réglages : suggestions de ponts autour des jours fériés, alerte de repos légal (11h entre deux journées), alerte de plafond journalier (10h), et modèles de sessions réutilisables en un clic.', 'Bilan hebdomadaire enrichi (vendredi et lundi) : pause moyenne, jours travaillés, et alertes de dépassement (plafond hebdo/jour, repos légal).'] },
    { version: '0.4.0', date: '2026-07-16', items: ['Fusion complète : audit trail, double confirmation, congés reportés, calendrier scolaire, alerte 48h et notifications visuelles de synchronisation réunis dans une seule version.'] },
    { version: '0.3.4', date: '2026-07-16', items: ['Intégration du calendrier scolaire (zones A/B/C) : dates officielles des vacances scolaires, visibles dans le calendrier des congés et listées pour anticiper les congés familiaux.'] },
    { version: '0.3.3', date: '2026-07-16', items: ['Gestion des congés reportés d\u2019une année sur l\u2019autre : plafond configurable par type, appliqué automatiquement au solde et au contrôle de quota.'] },
    { version: '0.3.2', date: '2026-07-16', items: ['Double confirmation avant suppression définitive de données sensibles : effacement complet de l\u2019historique et réinitialisation de la rémunération demandent désormais de taper un mot de confirmation.'] },
    { version: '0.3.1', date: '2026-07-16', items: ['Historique des modifications manuelles (audit trail) : trace les créations, modifications et suppressions sur les sessions, congés, taux horaires et primes.'] },
    { version: '0.3.0', date: '2026-07-16', items: ['Alerte de dépassement du plafond horaire légal hebdomadaire (48h par défaut, configurable) avec avertissement préventif et notification.'] },
    { version: '0.2.9', date: '2026-07-16', items: ['Correction : le champ Note manquait dans le modal \u00abModifier les horaires\u00bb, empêchant de consulter/modifier la note d\u2019une session terminée depuis cet écran.'] },
    { version: '0.2.8', date: '2026-07-16', items: ['Export PDF enrichi de graphiques : heures travaillées sur 12 semaines, répartition des congés, revenus bruts sur 6 mois (primes incluses).'] },
    { version: '0.2.7', date: '2026-07-16', items: ['Détection de tendances dans l\u2019Historique : jour de la semaine le plus/moins travaillé, évolution récente du temps de travail, régularité des horaires.'] },
    { version: '0.2.6', date: '2026-07-16', items: ['Alerte proactive de solde de congés à risque : avertit avant la date limite légale (ex. 31 mai) si des jours de CP/RTT non pris risquent d\u2019être perdus.'] },
    { version: '0.2.5', date: '2026-07-16', items: ['Comparateur avant/après augmentation : projette l\u2019impact d\u2019un changement de taux horaire sur le revenu annuel, basé sur ta moyenne réelle d\u2019heures travaillées et tes primes annuelles.'] },
    { version: '0.2.4', date: '2026-07-16', items: ['Historique des primes ponctuelles (13e mois, prime de vacances, prime d\u2019anciennet\u00e9...) : ajoutées aux gains estimés du mois où elles sont perçues.'] },
    { version: '0.2.3', date: '2026-07-16', items: ['Thèmes saisonniers avec dégradés (printemps, été, automne, hiver, Noël, coucher de soleil, aurore boréale, sakura) en plus des couleurs unies.'] },
    { version: '0.2.2', date: '2026-07-16', items: ['Réintégration du géofencing automatique : démarrage/fin de session en entrant/sortant de la zone de travail (ou d\u2019une zone secondaire), avec confirmation optionnelle avant action.'] },
    { version: '0.2.1', date: '2026-07-16', items: ['Possibilité de modifier le temps de pause d\u2019une session terminée (champ dédié) et d\u2019ajuster la pause d\u2019une session en cours directement depuis l\u2019écran principal.'] },
    { version: '0.2.0', date: '2026-07-15', items: ['Historique des taux horaires : garde trace des augmentations de salaire dans le temps pour que les calculs de gains rétroactifs sur d\u2019anciennes sessions restent corrects.'] },
    { version: '0.1.47', date: '2026-07-11', items: ['Clic sur un jour du calendrier sans congé pour pré-remplir le formulaire Ajouter un congé.'] },         { version: '0.1.46', date: '2026-07-11', items: ['Badge de version dynamique dans Réglages.', 'Rapport hebdomadaire automatique le lundi matin.', 'Correction du calendrier des congés (id calGrid).', 'Correction du graphique historique (format de date).'] },         { version: '0.1.45', date: '2026-07-10', items: ['Possibilité de modifier la note d\u2019une session enregistrée.', 'Note rapide en cours de journée.'] },         { version: '0.1.44', date: '2026-07-10', items: ['Toast d\u2019annulation après suppression d\u2019une session.'] },         { version: '0.1.43', date: '2026-07-10', items: ['Amélioration de la stabilité générale et du système de déploiement.'] },         { version: '0.1.42', date: '2026-07-09', items: ['Ajout d\'une transition fluide (fondu + léger déplacement) lors du changement d\'onglet dans l\'historique (jour/semaine/mois/année).'] },
    { version: '0.1.41', date: '2026-07-09', items: ['Ajout d\'un historique des versions de sauvegarde consultable dans Réglages > Sauvegarde. Possibilité de créer un point de restauration manuel et de revenir à un état antérieur en un clic.'] },
    { version: '0.1.39', date: '2026-07-08', items: ['Interrupteurs des réglages encore réduits. Correction du Service Worker : les mises à jour de l\'app s\'appliquent désormais automatiquement au lieu de rester bloquées en cache.'] },
    { version: '0.1.38', date: '2026-07-08', items: ['Réduction de la taille des interrupteurs (toggles) dans les réglages pour un rendu plus compact.'] },
    { version: '0.1.37', date: '2026-07-08', items: ['Le résumé s\'affiche désormais une seule fois, à la toute première ouverture de l\'app, et présente le récapitulatif de la journée d\'hier (heures, objectif, gains).'] },
    { version: '0.1.36', date: '2026-07-08', items: ['Ajout du résumé du jour à l\'ouverture de l\'app : aperçu de la progression du jour et de la semaine, avec gains estimés si la rémunération est activée. Une fois par jour, désactivable dans les réglages.'] },
    { version: '0.1.35', date: '2026-07-08', items: ['Ajout de la détection de session oubliée : si le chrono tourne depuis trop longtemps (seuil configurable de 6 à 20h), Orvia propose de corriger l\'heure de fin.'] },
    { version: '0.1.34', date: '2026-07-07', items: ['Ajout de l\'arrondi automatique des pointages (5, 10, 15 ou 30 min), avec choix du mode : neutre, en faveur du salarié, ou strict. S\'applique au chrono et à l\'ajout manuel de session.'] },
    { version: '0.1.33', date: '2026-07-07', items: ['Ajout des gains du mois en cours sur la page Aujourd\'hui, et dans la vue Historique > Mois. Le calcul respecte les tranches horaires hebdomadaires même pour les semaines à cheval sur deux mois.'] },
    { version: '0.1.32', date: '2026-07-07', items: ['Ajout de l\'estimation du salaire net après impôts : renseigne ton taux d\'imposition dans Réglages → Rémunération pour voir tes gains nets en plus du brut, sur la page Aujourd\'hui.'] },
    { version: '0.1.31', date: '2026-07-07', items: ['Rémunération : la majoration des heures supplémentaires se règle désormais par tranche horaire hebdomadaire (ex: 35h-39h à +25%, au-delà de 39h à +50%), avec seuils personnalisables.'] },
    { version: '0.1.30', date: '2026-07-07', items: ['Ajout du calcul de rémunération : renseigne ton taux horaire et une majoration pour les heures supplémentaires, et vois tes gains estimés du jour et de la semaine directement sur la page Aujourd\'hui.'] },
    { version: '0.1.29', date: '2026-07-07', items: ['Le solde d\'heures supplémentaires est désormais remis à zéro chaque lundi : il ne reflète plus que la semaine en cours, plutôt qu\'un cumul depuis le début.'] },
    { version: '0.1.28', date: '2026-07-07', items: ['Nouvelle vue "Mois" dans l\'historique : total travaillé, objectif du mois et heures supplémentaires calculées sur un mois complet, avec regroupement par semaine et par jour.'] },
    { version: '0.1.27', date: '2026-07-05', items: ['Ajout du suivi des heures supplémentaires : solde cumulé automatique depuis ta première session, comparé à tes objectifs hebdomadaires (congés et jours fériés pris en compte).', 'Nouvelle section dans les Réglages pour enregistrer une récupération (heures posées pour compenser ton solde) avec historique complet.'] },
    { version: '0.1.26', date: '2026-07-05', items: ['Le numéro de version affiché dans l\'app suit automatiquement le numéro du fichier'] },
    { version: '0.1.25', date: '2026-07-05', items: ['Jours fériés français calculés automatiquement (fixes et mobiles)', 'Objectifs de temps ajustés pour exclure les jours fériés', 'Marquage visuel des jours fériés dans le calendrier'] },
    { version: '0.1.24', date: '2026-07-05', items: ['Sauvegarde automatique hebdomadaire vers fichier téléchargé', 'Réglage du jour de sauvegarde dans les paramètres'] },
    { version: '0.1.23', date: '2026-07-05', items: ['Alerte quota bas quand il reste moins de 3 jours de CP ou RTT', 'Badge visuel sur les cartes de solde concernées'] },
    { version: '0.1.22', date: '2026-07-05', items: ['Correction du bug de décalage d\'un jour sur le calendrier des congés (fuseau horaire)'] },
    { version: '0.1.21', date: '2026-07-05', items: ['Calendrier des congés rendu interactif : clic sur un jour pour voir le détail et supprimer'] },
    { version: '0.1.20', date: '2026-07-05', items: ['Export Excel des heures travaillées'] },
    { version: '0.1.10', date: '2026-07-05', items: ['Corrections de vues et stabilisation générale'] },
    { version: '0.1.8', date: '2026-07-04', items: ['Version stabilisée renommée Orvia', 'Nettoyage général du code'] },
    { version: '0.1.5', date: '2026-07-04', items: ['Passage en PWA avec mode hors-ligne sécurisé'] },
    { version: '0.1.0', date: '2026-06-29', items: ['Première version stable du suivi de temps de travail'] },
  ];

  function renderChangelog() {
    const el = document.getElementById('changelogList');
    if (!el) return;
    el.innerHTML = CHANGELOG.map(entry => `
      <div class="settings-card" style="margin-bottom:10px;">
        <div class="settings-row">
          <label style="font-weight:800;color:var(--accent);">v${entry.version}</label>
          <div class="settings-summary">${entry.date}</div>
        </div>
        <div style="padding:0 16px 12px;">
          <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.6;">
            ${entry.items.map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      </div>
    `).join('');
  }

  function openChangelogSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-changelog-settings').classList.add('active');
    renderChangelog();
  }

  function openThemeSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-theme-settings').classList.add('active');
    renderThemePicker();
    initCompactMode();
  }

  function openReminderSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-reminder-settings').classList.add('active');
    renderReminderSettings();
    renderPauseReminderSettings();
  }

  function openCongesSettings() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-conges-settings').classList.add('active');
  }

let trendRange = 7;
function setTrendRange(n) {
  trendRange = n;
  document.getElementById('trendBtn7').classList.toggle('active', n === 7);
  document.getElementById('trendBtn30').classList.toggle('active', n === 30);
  renderTrendChart();
}

function getGoalForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const base = (objectifs.parJour && typeof objectifs.parJour[dow] !== 'undefined') ? objectifs.parJour[dow] : objectifs.jour;
  if (isDateOnConge(dateStr) || isDateHoliday(dateStr)) return 0;
  return base;
}

// ── IDENTIFICATION DU TYPE DE JOUR POUR LES GRAPHIQUES ──
// Renvoie le congé (s'il y en a un) couvrant cette date, ou null.
function getCongeOnDate(dateStr) {
  return state.conges.find(c => dateStr >= c.start && dateStr <= (c.end || c.start)) || null;
}

// Détermine le type de jour à afficher dans les graphiques : jour férié,
// congé (avec son type/couleur), ou jour normal travaillé/vide. Les jours
// fériés sont désormais comptés dans les graphiques (comme du temps à 0h
// « prévu ») mais restent visuellement distincts des congés et des jours
// normaux, pour qu'on comprenne pourquoi une barre est vide.
function getDayTypeInfo(dateStr) {
  const holidayLabel = getHolidayLabel(dateStr);
  if (holidayLabel) {
    return { kind: 'holiday', label: 'Jour férié : ' + holidayLabel, color: '#8b8fa8', short: 'F' };
  }
  const conge = getCongeOnDate(dateStr);
  if (conge) {
    return { kind: 'conge', label: getCongeTypeLabel(conge.type), color: getCongeTypeColor(conge.type), short: (getCongeTypeLabel(conge.type)[0] || 'C').toUpperCase() };
  }
  return { kind: 'normal', label: null, color: null, short: null };
}

let trendBarRects = [];

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  trendBarRects = [];
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || canvas.parentElement.clientWidth;
  const cssH = 160;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const n = trendRange;
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    days.push(toLocalISO(d));
  }

  const doneByDay = days.map(dateStr => {
    const ss = state.sessions.filter(s => toLocalISO(new Date(s.start)) === dateStr);
    return ss.reduce((a,s) => a + (s.net||0), 0) / 3600000;
  });
  const goalByDay = days.map(dateStr => getGoalForDate(dateStr) / 3600000);

  const maxVal = Math.max(1, ...doneByDay, ...goalByDay) * 1.15;
  const padL = 30, padR = 8, padT = 10, padB = 20;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const barGap = n === 7 ? 8 : 2;
  const barW = Math.max(1.5, (plotW / n) - barGap);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted') || '#8b8fa8';
  ctx.font = '9px -apple-system, sans-serif';
  for (let g = 0; g <= 3; g++) {
    const y = padT + plotH - (g/3) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.fillText((maxVal * g / 3).toFixed(0) + 'h', 2, y + 3);
  }

  const accent = getComputedStyle(document.body).getPropertyValue('--accent') || '#6c63ff';
  const muted = getComputedStyle(document.body).getPropertyValue('--muted') || '#8b8fa8';
  days.forEach((dateStr, i) => {
    const x = padL + i * (plotW / n) + (plotW/n - barW)/2;
    const h = (doneByDay[i] / maxVal) * plotH;
    const goalH = (goalByDay[i] / maxVal) * plotH;
    const done = doneByDay[i];
    const goal = goalByDay[i];
    const dayInfo = getDayTypeInfo(dateStr);
    ctx.fillStyle = goal > 0 && done >= goal ? (getComputedStyle(document.body).getPropertyValue('--green') || '#3ecf8e') : accent;
    ctx.fillRect(x, padT + plotH - h, barW, h);

    // Marque distincte pour les jours fériés / congés : un petit repère coloré
    // en haut de la colonne, pour que la barre à 0h ne soit pas confondue
    // avec un jour simplement non travaillé.
    if (dayInfo.kind !== 'normal') {
      ctx.save();
      ctx.fillStyle = dayInfo.color;
      const markerH = 4;
      ctx.fillRect(x, padT + plotH - Math.max(h, markerH), barW, markerH);
      if (h < markerH) ctx.fillRect(x, padT + plotH - markerH, barW, markerH);
      ctx.restore();
    }

    trendBarRects.push({ x, y: padT, w: barW, h: plotH, dateStr, done, goal, dayInfo });
    if (goal > 0) {
      ctx.strokeStyle = muted;
      ctx.setLineDash([2,2]);
      ctx.beginPath();
      ctx.moveTo(x - 1, padT + plotH - goalH);
      ctx.lineTo(x + barW + 1, padT + plotH - goalH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (n === 7 || i % 5 === 0 || i === n-1) {
      const d = new Date(dateStr + 'T00:00:00');
      const label = n === 7 ? d.toLocaleDateString('fr-FR', {weekday:'short'}).slice(0,2) : d.getDate().toString();
      ctx.fillStyle = dayInfo.kind !== 'normal' ? dayInfo.color : muted;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barW/2, cssH - 4);
      ctx.textAlign = 'left';
    }
  });
}

window.addEventListener('resize', () => { if (document.getElementById('page-history').classList.contains('active')) renderTrendChart(); });

// ── DÉTECTION DE TENDANCES ──

// ── COMPARAISONS MOIS PAR MOIS / ANNÉE PAR ANNÉE ──
let comparisonMode = 'month';
let comparisonBarRects = [];

function setComparisonMode(mode) {
  comparisonMode = mode;
  document.getElementById('cmpBtnMonth').classList.toggle('active', mode === 'month');
  document.getElementById('cmpBtnYear').classList.toggle('active', mode === 'year');
  renderComparisonChart();
}

function getMonthlyComparisonData() {
  const now = new Date();
  const labels = [], values = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const ms = state.sessions.filter(s => s.start >= start && s.start < end).reduce((a, s) => a + (s.net || 0), 0);
    labels.push(d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));
    values.push(ms / 3600000);
  }
  return { labels, values };
}

function getYearlyComparisonData() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [...new Set(state.sessions.map(s => new Date(s.start).getFullYear()))];
  const minYear = years.length ? Math.min(...years, currentYear) : currentYear;
  const labels = [], values = [];
  for (let y = minYear; y <= currentYear; y++) {
    const start = new Date(y, 0, 1).getTime();
    const end = new Date(y + 1, 0, 1).getTime();
    const ms = state.sessions.filter(s => s.start >= start && s.start < end).reduce((a, s) => a + (s.net || 0), 0);
    labels.push(String(y));
    values.push(ms / 3600000);
  }
  return { labels, values };
}

function renderComparisonChart() {
  const canvas = document.getElementById('comparisonChart');
  if (!canvas) return;
  comparisonBarRects = [];
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || canvas.parentElement.clientWidth;
  const cssH = 160;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const { labels, values } = comparisonMode === 'month' ? getMonthlyComparisonData() : getYearlyComparisonData();
  const n = values.length;
  if (!n) return;
  const maxVal = Math.max(1, ...values) * 1.15;
  const padL = 34, padR = 8, padT = 10, padB = 20;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const barGap = 6;
  const barW = Math.max(2, (plotW / n) - barGap);

  const muted = getComputedStyle(document.body).getPropertyValue('--muted') || '#8b8fa8';
  const accent = getComputedStyle(document.body).getPropertyValue('--accent') || '#6c63ff';

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.fillStyle = muted;
  ctx.font = '9px -apple-system, sans-serif';
  for (let g = 0; g <= 3; g++) {
    const y = padT + plotH - (g / 3) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.fillText((maxVal * g / 3).toFixed(0) + 'h', 2, y + 3);
  }

  const avg = values.reduce((a, v) => a + v, 0) / n;
  values.forEach((v, i) => {
    const x = padL + i * (plotW / n) + (plotW / n - barW) / 2;
    const h = (v / maxVal) * plotH;
    const isCurrent = i === n - 1;
    ctx.fillStyle = isCurrent ? accent : (v >= avg ? (getComputedStyle(document.body).getPropertyValue('--green') || '#3ecf8e') : muted);
    ctx.fillRect(x, padT + plotH - h, barW, h);
    comparisonBarRects.push({ x, y: padT, w: barW, h: plotH, label: labels[i], value: v });
    // Espace les étiquettes pour éviter qu'elles se chevauchent : avec 12
    // barres (vue mensuelle), les afficher toutes faisait se superposer le
    // texte de mois adjacents (ex. "août 25" et "sept. 25" fusionnaient
    // visuellement). On limite à ~6 étiquettes visibles maximum.
    const labelStep = Math.max(1, Math.ceil(n / 5));
    if (i % labelStep === 0 || i === n - 1) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, cssH - 4);
      ctx.textAlign = 'left';
    }
  });
}

function comparisonChartInteraction(evt) {
  const canvas = document.getElementById('comparisonChart');
  if (!canvas || !comparisonBarRects.length) return;
  const canvasRect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;
  const hit = comparisonBarRects.find(r => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y && y <= r.y + r.h);
  const tooltip = document.getElementById('comparisonTooltip');
  if (!tooltip) return;
  if (hit) {
    tooltip.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">${hit.label}</div><div>Total : <strong>${fmtHM(hit.value * 3600000)}</strong></div>`;
    tooltip.style.display = 'block';
    const container = canvas.parentElement;
    const containerRect = container.getBoundingClientRect();
    let left = clientX - containerRect.left;
    let top = (canvasRect.top - containerRect.top) - 10;
    requestAnimationFrame(() => {
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      left = Math.max(4, Math.min(left - tw / 2, container.clientWidth - tw - 4));
      tooltip.style.left = left + 'px';
      if (top - th >= 0) {
        tooltip.style.top = (top - th) + 'px';
      } else {
        tooltip.style.top = (canvasRect.bottom - containerRect.top + 8) + 'px';
      }
    });
  } else {
    tooltip.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('comparisonChart');
  if (canvas) {
    canvas.addEventListener('click', comparisonChartInteraction);
    canvas.addEventListener('mousemove', comparisonChartInteraction);
    canvas.addEventListener('touchstart', comparisonChartInteraction, { passive: true });
    canvas.addEventListener('mouseleave', () => { const t = document.getElementById('comparisonTooltip'); if (t) t.style.display = 'none'; });
  }
});

window.addEventListener('resize', () => { if (document.getElementById('page-history').classList.contains('active')) { renderComparisonChart(); renderMultiYearChart(); } });

// Export du graphique de comparaison actif (mois ou année) en image PNG,
// en redessinant sur un canvas hors-écran à plus haute résolution pour un
// export net, avec fond opaque (le canvas d'affichage a un fond transparent).
function exportComparisonChartImage() {
  const canvas = document.getElementById('comparisonChart');
  if (!canvas) return;
  const scale = 2;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width * scale / (window.devicePixelRatio || 1);
  exportCanvas.height = canvas.height * scale / (window.devicePixelRatio || 1);
  const ectx = exportCanvas.getContext('2d');
  const bgColor = getComputedStyle(document.body).getPropertyValue('--card') || '#12222b';
  ectx.fillStyle = bgColor.trim() || '#12222b';
  ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  ectx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  exportCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparaison_${comparisonMode === 'month' ? 'mensuelle' : 'annuelle'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Image exportée');
  }, 'image/png');
}

// ── MOYENNE DU TEMPS DE PAUSE PAR JOUR ──
function getAveragePauseStats() {
  const byDate = {};
  state.sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = 0;
    byDate[s.date] += (s.pauseMs || 0);
  });
  const dates = Object.keys(byDate);
  if (!dates.length) return { avgMs: 0, daysCount: 0, totalMs: 0 };
  const totalMs = dates.reduce((a, d) => a + byDate[d], 0);
  return { avgMs: totalMs / dates.length, daysCount: dates.length, totalMs };
}

function renderPauseStatsGrid() {
  const el = document.getElementById('pauseStatsGrid');
  if (!el) return;
  const { avgMs, daysCount } = getAveragePauseStats();
  el.innerHTML = `
    <div class="stat-card full">
      <div class="stat-val" style="color:var(--accent2)">${fmtHM(avgMs)}</div>
      <div class="stat-lbl">Pause moyenne / jour travaillé (${daysCount} jour${daysCount > 1 ? 's' : ''})</div>
    </div>`;
}

// Analyse les sessions historiques pour repérer des habitudes récurrentes :
// jour de la semaine le plus/moins travaillé, évolution récente vs
// précédente, régularité des horaires. Nécessite un minimum de données pour
// éviter des conclusions statistiquement peu fiables.
const TREND_MIN_SESSIONS = 10;
const TREND_MIN_WEEKS = 3;

function getSessionDayOfWeekStats() {
  const byDow = [[], [], [], [], [], [], []]; // 0=dimanche ... 6=samedi
  state.sessions.forEach(s => {
    const dow = new Date(s.start).getDay();
    byDow[dow].push((s.net || 0) / 3600000);
  });
  return byDow.map((hoursArr, dow) => ({
    dow,
    count: hoursArr.length,
    avgH: hoursArr.length ? hoursArr.reduce((a, h) => a + h, 0) / hoursArr.length : 0
  }));
}

function getDowLabel(dow) {
  return ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][dow];
}

// Compare les 4 dernières semaines pleines aux 4 précédentes, pour détecter
// une tendance à la hausse ou à la baisse du temps travaillé.
function getRecentTrendComparison() {
  const now = new Date();
  const thisMonday = getMondayOf(now);
  const recentStart = new Date(thisMonday); recentStart.setDate(thisMonday.getDate() - 28);
  const priorStart = new Date(thisMonday); priorStart.setDate(thisMonday.getDate() - 56);

  const recentMs = state.sessions
    .filter(s => s.start >= recentStart.getTime() && s.start < thisMonday.getTime())
    .reduce((a, s) => a + (s.net || 0), 0);
  const priorMs = state.sessions
    .filter(s => s.start >= priorStart.getTime() && s.start < recentStart.getTime())
    .reduce((a, s) => a + (s.net || 0), 0);

  if (priorMs <= 0) return null;
  const pct = ((recentMs - priorMs) / priorMs) * 100;
  return { recentH: recentMs / 3600000, priorH: priorMs / 3600000, pct };
}

// Écart-type des heures de démarrage de session, pour évaluer la régularité
// des horaires (faible écart = routine stable, fort écart = horaires variables).
function getStartTimeRegularity() {
  const startMinutes = state.sessions.map(s => {
    const d = new Date(s.start);
    return d.getHours() * 60 + d.getMinutes();
  });
  if (startMinutes.length < TREND_MIN_SESSIONS) return null;
  const avg = startMinutes.reduce((a, m) => a + m, 0) / startMinutes.length;
  const variance = startMinutes.reduce((a, m) => a + Math.pow(m - avg, 2), 0) / startMinutes.length;
  const stdDevMinutes = Math.sqrt(variance);
  const avgH = Math.floor(avg / 60), avgM = Math.round(avg % 60);
  return { avgTime: `${String(avgH).padStart(2, '0')}:${String(avgM).padStart(2, '0')}`, stdDevMinutes };
}

function computeTrendInsights() {
  const insights = [];
  if (state.sessions.length < TREND_MIN_SESSIONS) return insights;

  const dowStats = getSessionDayOfWeekStats();
  const withData = dowStats.filter(d => d.count >= 2);
  if (withData.length >= 3) {
    const overallAvg = withData.reduce((a, d) => a + d.avgH * d.count, 0) / withData.reduce((a, d) => a + d.count, 0);
    if (overallAvg > 0) {
      const sorted = [...withData].sort((a, b) => b.avgH - a.avgH);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const topDiffPct = ((top.avgH - overallAvg) / overallAvg) * 100;
      const bottomDiffPct = ((overallAvg - bottom.avgH) / overallAvg) * 100;
      if (topDiffPct > 8) {
        insights.push({ icon: '📈', text: `Tu travailles en moyenne ${topDiffPct.toFixed(0)}% plus le ${getDowLabel(top.dow)} que les autres jours.` });
      }
      if (bottomDiffPct > 8 && bottom.dow !== top.dow) {
        insights.push({ icon: '📉', text: `Tu travailles en moyenne ${bottomDiffPct.toFixed(0)}% moins le ${getDowLabel(bottom.dow)} que les autres jours.` });
      }
    }
  }

  const trend = getRecentTrendComparison();
  if (trend && Math.abs(trend.pct) > 5) {
    const sign = trend.pct > 0 ? 'en hausse' : 'en baisse';
    const icon = trend.pct > 0 ? '📈' : '📉';
    insights.push({ icon, text: `Ton temps de travail est ${sign} de ${Math.abs(trend.pct).toFixed(0)}% sur les 4 dernières semaines (${trend.recentH.toFixed(1)}h vs ${trend.priorH.toFixed(1)}h précédemment).` });
  }

  const regularity = getStartTimeRegularity();
  if (regularity) {
    if (regularity.stdDevMinutes < 20) {
      insights.push({ icon: '🎯', text: `Tes horaires sont très réguliers : tu démarres en moyenne vers ${regularity.avgTime} avec peu de variation.` });
    } else if (regularity.stdDevMinutes > 60) {
      insights.push({ icon: '🔀', text: `Tes horaires de démarrage varient beaucoup (moyenne ${regularity.avgTime}, écart-type ${Math.round(regularity.stdDevMinutes)} min).` });
    }
  }

  return insights;
}

function renderTrendInsights() {
  const el = document.getElementById('trendInsightsList');
  if (!el) return;

  if (state.sessions.length < TREND_MIN_SESSIONS) {
    el.innerHTML = `<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Pas encore assez de sessions enregistrées (minimum ${TREND_MIN_SESSIONS}) pour détecter des tendances fiables.</div></div>`;
    return;
  }

  const insights = computeTrendInsights();
  if (!insights.length) {
    el.innerHTML = '<div class="settings-card" style="padding:14px;"><div style="font-size:13px;color:var(--muted);">Aucune tendance marquante détectée pour le moment, tes habitudes de travail semblent stables.</div></div>';
    return;
  }

  el.innerHTML = insights.map(ins => `
    <div class="settings-card" style="margin-bottom:8px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px;">
      <div style="font-size:18px;line-height:1;">${ins.icon}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.4;">${ins.text}</div>
    </div>
  `).join('');
}

function showTrendTooltip(clientX, clientY, rect) {
  const dateObj = new Date(rect.dateStr + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const doneMs = rect.done * 3600000;
  const goalMs = rect.goal * 3600000;
  const diffMs = doneMs - goalMs;
  const diffLabel = rect.goal > 0
    ? (diffMs >= 0 ? `+${fmtHM(diffMs)} vs objectif` : `-${fmtHM(Math.abs(diffMs))} vs objectif`)
    : "Pas d'objectif ce jour";
  const diffColor = rect.goal > 0 ? (diffMs >= 0 ? 'var(--green)' : 'var(--orange)') : 'var(--muted)';

  const tooltip = document.getElementById('trendTooltip');
  if (!tooltip) return;
  const dayInfo = rect.dayInfo || getDayTypeInfo(rect.dateStr);
  const dayTypeHtml = dayInfo.kind !== 'normal'
    ? `<div style="color:${dayInfo.color};font-weight:700;margin-top:2px;">${dayInfo.kind === 'holiday' ? '🏳️' : '📅'} ${dayInfo.label}</div>`
    : '';
  tooltip.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;">${dateLabel}</div>
    <div>Réalisé : <strong>${fmtHM(doneMs)}</strong></div>
    <div>Objectif : <strong>${rect.goal > 0 ? fmtHM(goalMs) : '—'}</strong></div>
    <div style="color:${diffColor};font-weight:600;margin-top:2px;">${diffLabel}</div>
    ${dayTypeHtml}
  `;
  tooltip.style.display = 'block';

  const canvas = document.getElementById('trendChart');
  const canvasRect = canvas.getBoundingClientRect();
  const container = canvas.parentElement;
  const containerRect = container.getBoundingClientRect();
  let left = clientX - containerRect.left;
  let top = (canvasRect.top - containerRect.top) - 10;

  requestAnimationFrame(() => {
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let adjLeft = left - tw / 2;
    if (adjLeft < 4) adjLeft = 4;
    if (adjLeft + tw > containerRect.width - 4) adjLeft = containerRect.width - tw - 4;
    tooltip.style.left = adjLeft + 'px';
    // S'il n'y a pas assez de place au-dessus du graphique pour afficher
    // toute l'infobulle (cas le plus fréquent : peu de padding au-dessus du
    // canvas), on l'affiche sous le graphique à la place, pour ne jamais la
    // faire chevaucher les barres et masquer une partie de son contenu.
    if (top - th >= 4) {
      tooltip.style.top = (top - th) + 'px';
    } else {
      tooltip.style.top = (canvasRect.bottom - containerRect.top + 8) + 'px';
    }
  });
}

function hideTrendTooltip() {
  const tooltip = document.getElementById('trendTooltip');
  if (tooltip) tooltip.style.display = 'none';
}

function handleTrendChartInteraction(evt) {
  const canvas = document.getElementById('trendChart');
  if (!canvas || !trendBarRects.length) return;
  const canvasRect = canvas.getBoundingClientRect();
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;

  const hit = trendBarRects.find(r => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y && y <= r.y + r.h);
  if (hit) {
    showTrendTooltip(clientX, clientY, hit);
  } else {
    hideTrendTooltip();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  canvas.addEventListener('click', handleTrendChartInteraction);
  canvas.addEventListener('touchstart', (e) => { handleTrendChartInteraction(e); }, { passive: true });
  document.addEventListener('click', (e) => {
    if (e.target.id !== 'trendChart') hideTrendTooltip();
  });
});


