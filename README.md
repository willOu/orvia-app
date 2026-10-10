# Orvia

PWA de suivi du temps de travail (sans framework, scripts classiques).

## Structure
- `index.html` : balisage et écran de démarrage
- `css/app.css` : styles
- `js/01…10-*.js` : code, chargé dans l'ordre (portée globale partagée)
  - 01 état, synchro cloud et fusion · 02 audit, rémunération · 03 aides, minuteur
  - 04 alertes, planning · 05 historique · 06 export · 07 congés
  - 08 réglages · 09 géofence, statistiques · 10 interface, initialisation
- `sw.js` : cache hors ligne (liste des fichiers à tenir à jour si on en ajoute)
- `manifest.webmanifest`, icônes, `deploy.html`
- `scripts/bump_version.py` : bump de version (APP_VERSION, CACHE_VERSION, changelog)

## Synchronisation
Fusion session par session (clé = heure de début) et congé par congé (clé = id).
Les suppressions sont suivies 90 jours. Les réglages viennent de l'appareil modifié en dernier.

## Publier
git add -A && git commit -F COMMIT_MESSAGE.txt && python3 scripts/bump_version.py && git add -A && git commit --amend --no-edit && git push origin main
