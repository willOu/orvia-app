# Orvia — v2.1.0 (RTT effectif, congé rapide, vue mensuelle, raccourcis enrichis)

## Contenu du zip
- index.html : v2.1.0
- sw.js      : CACHE_VERSION synchronisé (orvia-v2.1.0)
- COMMIT_MESSAGE.txt : message de commit prêt à l'emploi

## Déploiement

git add index.html sw.js
git commit -F COMMIT_MESSAGE.txt
git push origin main

## Détail des fonctionnalités ajoutées

### 1. Ajout de congé en un clic depuis le calendrier
Cliquer sur un jour libre du calendrier des congés ouvre désormais une mini-fenêtre
(type de congé + note optionnelle) qui enregistre directement le congé pour cette
date, sans passer par le formulaire complet. Un bouton "Formulaire complet" reste
disponible pour les congés sur plusieurs jours ou plus de contrôle.
- Nouvelle modale `#quickAddCongeModal` dans le HTML.
- `openAddCongeForDate(dateStr)` ouvre désormais cette modale au lieu de rediriger
  vers l'onglet Congés.
- Nouvelles fonctions : `closeQuickAddCongeModal()`, `submitQuickAddConge()`,
  `openFullCongeFormFromQuickAdd()`.

### 2. RTT comptée comme temps de travail effectif
Les jours de RTT posés ne réduisent plus l'objectif hebdomadaire/mensuel sans
être comptés comme "réalisé" : ils sont désormais ajoutés au temps travaillé
affiché (compteur du jour, de la semaine, solde d'heures supplémentaires, vue
mensuelle), à hauteur de l'objectif du jour concerné — l'option la plus sûre
pour un suivi côté paie. Les congés payés (CP) restent traités comme avant
(exclus de l'objectif, jamais comptés comme travaillés).
- Nouvelle fonction `isDateOnRTT(dateStr)` et `getGoalForDow(dow)`.
- Nouvelle fonction `getRTTGoalMsForRange(start, endExclusive)`.
- `getWeekGoalForMonday()`, `getMonthGoal()`, `renderObjectifs()`,
  `getOvertimeBalance()` et la vue mensuelle de l'historique mis à jour.

### 3. Vue mensuelle plus lisible avec heures supplémentaires
La vue "Mois" de l'historique affiche maintenant une barre de progression et
le pourcentage d'objectif atteint pour chaque mois, en plus de l'écart en
heures supplémentaires déjà présent. Le total mensuel affiché indique
également la part d'heures RTT incluses.

### 4. Automatisations Raccourcis enrichies
Nouvelle section "Arrêt automatique à l'arrivée chez soi" dans Réglages >
Raccourcis iOS : guide pas-à-pas pour créer une automatisation personnelle
native (déclencheur Arrivée à un lieu, action Ouvrir les URL vers
`?action=stop`), qui fonctionne même app fermée, contrairement au
géofencing web existant limité au premier plan.

Nouveau réglage "Notifications de confirmation" (`shortcutNotifEnabled`) :
quand une action est déclenchée via URL (`?action=start/stop/pause`), Orvia
affiche une Notification native locale confirmant l'action et l'heure.
- `getShortcutNotifEnabled()` / `onShortcutNotifToggle()` : préférence en
  localStorage, avec demande de permission Notification à l'activation.
- `notifyShortcutActionResult(message)` : échoue silencieusement si la
  permission n'est pas accordée, sans jamais bloquer l'action déclenchée.
- `handleQuickAction()` enrichi : notification sur chaque action, et gestion
  du cas "reprise après pause" (pause déclenchée alors que le statut est
  déjà `paused`).

## Aucun impact Supabase
Toutes ces fonctionnalités reposent sur le state local, localStorage et
l'API Notification native du navigateur. Aucun changement de schéma ou de
policy Supabase n'est requis.
