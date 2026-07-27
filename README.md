# Orvia — v2.0.2 + Automatisation du versioning

## Contenu du zip

- index.html                          : v2.0.2, correctifs surbrillance + libellé mensuel
- sw.js                               : CACHE_VERSION synchronisé (orvia-v2.0.2)
- deploy.html                         : inchangé
- .github/workflows/deploy.yml        : workflow GitHub Actions (bump auto + déploiement)
- scripts/bump_version.py             : script de bump de version automatique
- CONVENTION_COMMITS.md               : règles de préfixes de commit (fix/feat/breaking)
- COMMIT_MESSAGE.txt                  : message de commit prêt pour la version 2.0.2

## Installation dans votre dépôt GitHub

1. Copiez tous les fichiers de ce zip dans la racine de votre dépôt
   (respectez l'arborescence .github/ et scripts/).
2. Committez ce premier lot avec le préfixe fix: pour respecter la convention :

   git add .
   git commit -F COMMIT_MESSAGE.txt
   git push origin main

3. À partir du commit SUIVANT, utilisez systématiquement un préfixe
   fix: / feat: / breaking: dans vos messages de commit (voir
   CONVENTION_COMMITS.md). Le bump de version et le déploiement seront
   alors 100% automatiques.

## Important : Pages doit être activé

Dans votre dépôt GitHub : Settings > Pages > Source > "GitHub Actions".
Sans cette étape, le job "deploy" du workflow échouera.

## Aucun impact Supabase

Cette automatisation ne touche à rien côté Supabase (pas de schéma,
pas de policy, pas de table). Elle concerne uniquement le versioning
et le déploiement statique du front-end.
