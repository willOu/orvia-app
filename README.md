# Orvia — correctifs v2.1.4 (audit complet)

## Contenu
- index.html, sw.js, manifest.webmanifest, deploy.html
- icon-maskable-192.png / icon-maskable-512.png (nouveaux)
- COMMIT_MESSAGE.txt : message prêt à l'emploi (préfixe `fix:` = bump PATCH auto)

La version (APP_VERSION / CACHE_VERSION) n'est PAS modifiée à la main : le workflow GitHub Actions s'en charge.

## Déploiement
git add index.html sw.js manifest.webmanifest deploy.html icon-maskable-192.png icon-maskable-512.png
git commit -F COMMIT_MESSAGE.txt
git push origin main

## Correctifs
- Alertes de congés (solde à risque, quota bas) : calculées par année, avec report, comme l'écran Congés.
- Sauvegardes / import / cloud / restauration : types de congés personnalisés, libellés et quotas désormais conservés.
- Alerte plafond hebdo : l'état n'est plus perdu au rechargement (plus de notification en double).
- Minuteur : plus de double intervalle possible ; objectifs rafraîchis toutes les 15 s au lieu de chaque seconde.
- Notifications : passage par le service worker (fiable sur iPhone en PWA), repli sur l'API classique.
- Suppression rapide de deux éléments à la suite : la première suppression est validée au lieu d'être perdue.
- Synchronisation cloud regroupée (anti-rafale d'envois).
- Export Excel : durées et jours en vrais nombres.
- Barème IR 2026 mis à jour (revenus 2025 : 11 600 / 29 579 / 84 577 / 181 917).
- Icônes maskable dédiées, manifest et cache SW mis à jour.
- deploy.html : jeton gardé en sessionStorage, journal sans innerHTML.
- Divers : titre iOS « Orvia », splash plus court, changelog 0.7.0 → 0.2.0 corrigé, libellé Raccourcis.

## Non traité
- workdaysBetween compte lundi–vendredi alors que l'aide BTP parle de lundi–samedi.
- user-scalable=no (accessibilité), structure monolithique d'index.html.
- Politiques RLS Supabase à vérifier côté projet.
