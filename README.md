# Orvia — v2.0.6 (audit complet : géofencing, sync cloud, historique primes/taux)

## Contenu du zip
- index.html : v2.0.6
- sw.js      : CACHE_VERSION synchronisé (orvia-v2.0.6)
- COMMIT_MESSAGE.txt : message de commit prêt à l'emploi

## Déploiement

git add index.html sw.js
git commit -F COMMIT_MESSAGE.txt
git push origin main

Si votre workflow GitHub Actions de bump automatique est en place, ce
commit fix: déclenchera normalement un bump supplémentaire (2.0.6 -> 2.0.7)
au push. Si vous préférez garder exactement la version 2.0.6 telle que
fournie ici, committez sans le préfixe fix:, ou désactivez temporairement
le workflow pour ce commit.

## Détail des correctifs (audit complet demandé)

### 1. Géofencing — timer de confirmation jamais annulé
`triggerGeofenceAction()` créait un objet `geofencePendingAction = { type }`
sans jamais renseigner son champ `timerId`. Résultat : quand
`stopGeofenceWatch()` tentait d'annuler l'action en attente via
`clearTimeout(geofencePendingAction.timerId)`, cet appel ne faisait
rien (ID undefined). Si vous désactiviez le géofencing — ou changiez
de zone — pendant les 5 secondes de compte à rebours affichées par le
toast de confirmation, la session démarrait/s'arrêtait quand même,
malgré la désactivation. Corrigé en récupérant le véritable ID de
timer exposé par `showUndoToast()`.

### 2. Sécurité de la synchronisation cloud
`autoSyncOnOpen()` et `handleRealtimeCloudChange()` acceptaient
toujours d'écraser les données locales dès que le cloud semblait plus
récent (`remoteTs > localTs`), sans vérifier si des changements locaux
étaient encore en attente d'envoi (file de synchronisation non vide).
Scénario à risque : vous modifiez des sessions hors-ligne → un autre
appareil écrit dans le cloud entre-temps → vous vous reconnectez → le
push échoue ou n'a pas encore eu lieu → le pull suivant écrasait vos
modifications locales non envoyées. Les deux fonctions vérifient
désormais la file de synchronisation avant d'accepter un écrasement :
si des changements locaux sont en attente, on ne tire pas le cloud tant
qu'ils n'ont pas été envoyés avec succès.

### 3. Historique des primes et taux horaires jamais sauvegardé
`primesHistory` et `tauxHoraireHistory` n'apparaissaient dans aucune
sauvegarde : ni dans l'export/import JSON manuel, ni dans la
synchronisation cloud. Ces deux historiques restaient donc strictement
locaux à chaque appareil/navigateur — un changement d'appareil, une
réinstallation, ou une restauration à partir d'une sauvegarde cloud les
faisait silencieusement disparaître, faussant ensuite les calculs qui
en dépendent (comparateur d'augmentation, moyenne des primes, taux
rétroactif par date). Ajoutés à `buildBackupData()`,
`sanitizeBackupData()` (avec repli sur l'historique local actuel si le
champ est absent d'une ancienne sauvegarde, pour ne rien casser en
rétrocompatibilité) et restaurés dans `importBackup()` et
`applyCloudBackup()`.

## Aucun impact schéma Supabase
La colonne `data` de `orvia_backups` est un JSONB : ajouter des clés
supplémentaires (`primesHistory`, `tauxHoraireHistory`) est purement
additif, aucune migration de schéma ou de policy n'est nécessaire.

## Zones auditées sans anomalie trouvée
Simulateur fiscal par tranches (`calcTrancheGainForRange`,
`calcGainsMois`), historique des taux horaires par date
(`getTauxHoraireForDate`), notifications (pause, objectifs, congés,
plafond légal, anniversaire de travail), badge d'icône, intégration
Raccourcis iOS (démarrage/pause/fin via URL).
