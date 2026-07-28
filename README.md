# Orvia — v2.0.8 (infobulles illisibles + chevauchement étiquettes Comparaisons)

## Contenu du zip
- index.html : v2.0.8
- sw.js      : CACHE_VERSION synchronisé (orvia-v2.0.8)
- COMMIT_MESSAGE.txt : message de commit prêt à l'emploi

## Déploiement

git add index.html sw.js
git commit -F COMMIT_MESSAGE.txt
git push origin main

Si votre workflow GitHub Actions de bump automatique est en place, ce
commit fix: déclenchera normalement un bump supplémentaire (2.0.8 -> 2.0.9)
au push. Si vous préférez garder exactement la version 2.0.8 telle que
fournie ici, committez sans le préfixe fix:, ou désactivez temporairement
le workflow pour ce commit.

## Détail des correctifs (diagnostiqués à partir de vos captures d'écran)

### 1. Texte des infobulles quasi invisible
Sur les infobulles des graphiques Tendance vs objectif et Comparaisons,
seule la ligne d'écart (ex. "+01:43 vs objectif") était réellement
lisible. La date, "Réalisé" et "Objectif" étaient bien présents dans le
HTML mais en couleur `var(--text)` — sombre en thème clair — sur un
fond d'infobulle fixe très sombre (#0b1f2a). Texte quasiment invisible.
Seule la ligne d'écart avait une couleur explicite (vert/orange), d'où
l'illusion que "seule la durée en plus ou en moins" s'affichait. Couleur
de texte fixée à un blanc cassé (#e8eaf6) pour rester lisible peu
importe le thème actif.

### 2. Étiquettes du graphique Comparaisons qui se chevauchent
En vue "Mois", les 12 barres (12 derniers mois) affichaient chacune leur
étiquette ("juil. 26", "août 25", etc.) sans aucun espacement — une
condition de code (`n <= 12`) était toujours vraie pour ce cas précis et
désactivait de fait le mécanisme d'espacement des étiquettes. Sur un
écran de mobile, le texte de mois adjacents se chevauchait complètement,
donnant l'impression d'un "25" répété partout (en réalité les millésimes
2025/2026 de plusieurs étiquettes superposées). Le nombre d'étiquettes
affichées est maintenant limité à ~5-6, réparties uniformément, pour
rester lisible quel que soit le nombre de barres.

## Aucun impact Supabase
Ces deux correctifs sont purement visuels (CSS + logique de dessin
canvas côté client). Aucun impact sur le schéma ou les policies
Supabase.
