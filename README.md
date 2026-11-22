# Orvia

PWA de suivi du temps de travail (sans framework, scripts classiques).

## Structure
- `index.html` : balisage et écran de démarrage
- `css/app.css`, `css/glass.css` : styles (thème Liquid Glass)
- `js/01…11-*.js` : code, chargé dans l'ordre (portée globale partagée)
  - 01 état et stockage · 02 audit, rémunération · 03 aides, minuteur
  - 04 alertes, planning · 05 historique · 06 export · 07 congés
  - 08 réglages · 09 géofence, statistiques · 10 interface, initialisation
  - 11 nouveautés (fin de journée, correction de journée, simulateur, stats, ponts…)
- `sw.js` : cache hors ligne (liste des fichiers à tenir à jour si on en ajoute)
- `manifest.webmanifest`, icônes, `deploy.html`
- `scripts/bump_version.py` : bump de version (APP_VERSION, CACHE_VERSION, changelog)

## Données
Stockage local uniquement (localStorage), plus de compte ni de synchronisation cloud.
Sauvegarde par fichier JSON : Réglages > Sauvegarde (rappel hebdomadaire, export / import).

## Publier
git add -A && git commit -F COMMIT_MESSAGE.txt && python3 scripts/bump_version.py && git add -A && git commit --amend --no-edit && git push origin main
