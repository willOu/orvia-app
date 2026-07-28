# Orvia — v2.1.2 (correction de 2 bugs identifiés à l'audit)

## Contenu du zip
- index.html : v2.1.2
- sw.js      : CACHE_VERSION synchronisé (orvia-v2.1.2)
- COMMIT_MESSAGE.txt : message de commit prêt à l'emploi

## Déploiement

git add index.html sw.js
git commit -F COMMIT_MESSAGE.txt
git push origin main

## Détail des corrections

### 1. Jours travaillés jamais mis en évidence au calendrier des congés
Dans `renderCal()`, la classe CSS `work` (qui colore un jour comme "travaillé")
était rattachée par erreur au mauvais bloc `if/else if` : elle ne s'appliquait
que dans un cas qui ne se produit quasiment jamais en pratique. Résultat : un
jour travaillé normal (sans congé posé) n'était jamais mis en évidence
visuellement dans le calendrier.
- Correction : la condition est désormais indépendante des congés personnalisés
  et s'applique correctement dès qu'un jour sans congé a une session enregistrée.

### 2. Badge de version fantôme en haut de l'écran
Le code appelait déjà `document.getElementById('versionBadgeTop')` pour
afficher la version de l'app en haut de l'écran principal, mais aucun élément
avec cet id n'existait dans le HTML — seul le style CSS `.version-badge-topright`
était défini, sans balise associée. Le badge n'a donc jamais été visible.
- Correction : ajout de l'élément `<div id="versionBadgeTop">` dans le header,
  initialisé au chargement de l'app et cliquable pour ouvrir directement la
  page "À propos".

## Aucun impact Supabase
Ces deux correctifs sont purement visuels/front-end (rendu HTML/CSS et
affectation de classes). Aucun changement de schéma ou de policy Supabase
n'est requis.
