# Convention de commit Orvia — versioning automatique

À partir de maintenant, CHAQUE commit sur `main` qui touche `index.html`,
`sw.js` ou `deploy.html` déclenche automatiquement :
1. Le bump de version (APP_VERSION dans index.html + CACHE_VERSION dans sw.js)
2. L'ajout d'une entrée dans le CHANGELOG intégré à l'app
3. Le déploiement sur GitHub Pages

## Préfixes de commit à utiliser

| Préfixe      | Type de version bumpée      | Exemple                                            |
|--------------|------------------------------|-----------------------------------------------------|
| `fix:`       | PATCH (+0.0.1)               | `fix: corrige la surbrillance des boutons Historique` |
| `feat:`      | MINOR (+0.1.0)                | `feat: ajoute le widget écran d'accueil`            |
| `breaking:`  | MAJOR (+1.0.0)                | `breaking: refonte complète du modèle de données`  |

Si aucun préfixe reconnu n'est utilisé, un bump PATCH est appliqué par défaut.

## Exemples concrets

- Correctif mineur (bug d'affichage, faute de frappe, petit calcul) :
  `fix: corrige le libellé de comparaison mensuelle`
  → 2.0.2 devient 2.0.3

- Nouvelle fonctionnalité (nouvel écran, nouvelle option, nouvelle intégration) :
  `feat: ajoute la synchronisation multi-comptes`
  → 2.0.2 devient 2.1.0

- Changement majeur cassant la compatibilité (nouveau schéma Supabase
  incompatible avec l'ancien, refonte de la structure de sessions, etc.) :
  `breaking: migre vers le nouveau schéma de sessions v2`
  → 2.0.2 devient 3.0.0

## Ce qui se passe automatiquement

1. Vous poussez votre commit sur `main` avec le bon préfixe.
2. Le workflow GitHub Actions (`.github/workflows/deploy.yml`) se déclenche.
3. Le script `scripts/bump_version.py` lit le message du dernier commit,
   détecte le type de bump, met à jour `APP_VERSION` (index.html) et
   `CACHE_VERSION` (sw.js) à la MÊME valeur, et ajoute une entrée au
   changelog visible dans Réglages > À propos > Historique des versions.
4. Un commit automatique `chore: bump version to vX.X.X [skip-bump]`
   est créé et poussé (le tag `[skip-bump]` évite une boucle infinie).
5. Le site est déployé sur GitHub Pages avec la nouvelle version.

## Pourquoi c'était nécessaire

Avant cette automatisation, `APP_VERSION` (index.html) et `CACHE_VERSION`
(sw.js) étaient mis à jour manuellement et pouvaient se désynchroniser :
au moment de la mise en place, index.html affichait déjà la v2.0.2
alors que sw.js était resté bloqué à v1.9.5. Résultat possible : le
service worker ne détecte pas la nouvelle version et sert une page en
cache obsolète aux utilisateurs. Le nouveau système élimine ce risque
en gérant les deux fichiers depuis une source unique de vérité.
