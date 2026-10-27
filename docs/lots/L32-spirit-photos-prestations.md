# L32 — Spirit ACS : changer les photos des cartes de prestations depuis l'admin

Risque : à classer par l'outil (admin + upload d'images + site sur mesure). Branche partie de `main` (kit 2.1.7).

## Constat

Le site sur mesure de Spirit ACS (`customSiteKey = "spirit-acs"`) affiche une photo par famille de prestations,
codée en dur dans `components/custom-sites/spirit-acs/configurator/flow-data.ts` (`image: ${BASE}/…`) et reprise dans
`components/custom-sites/spirit-acs/seo-content.ts` (pages de prestations). Les fichiers sont dans
`public/custom-sites/spirit-acs/`. Le client ne peut pas les changer lui-même. Les TEXTES du site sont déjà modifiables
dans Paramètres › Site public › « Textes du site » (`components/admin/settings/spirit-site-texts.tsx`,
`app/admin/(dashboard)/parametres/spirit-texts-actions.ts`, garde `requireSpiritEditor`).

## Décisions (tranchées, Clément 26/10/2026)

- [x] **7 photos modifiables** (Clément, 27/10/2026) : les 6 familles visibles sur le site (nettoyage, polissage-ceramique,
  ppf-personnalisation, renovation-phares, moto, nettoyage-textile) + « Protection céramique » (page et carte d'accueil
  qui utilisent ceramique-bmw-m4.jpg), indépendante de Polissage. Entretien régulier et Moteur & échappement : exclus
  (aucune image visible). Chaque photo s'affiche aussi sur la carte « Nos prestations » de l'accueil.
  La photo choisie remplace l'image de cette famille **partout où elle s'affiche** : carte du configurateur et page de la
  prestation (`seo-content.ts`) quand c'est la même image d'origine.
- [x] **Hors périmètre** : la photo du hero d'accueil, la photo « Qui sommes-nous », le logo.
- [x] Emplacement : une nouvelle section **« Photos des prestations »** juste sous « Textes du site », visible UNIQUEMENT
  pour le tenant Spirit ACS (même garde que les textes). Aucune autre entreprise ne la voit.
- [x] Pour chaque famille : vignette de la photo actuelle, bouton « Changer la photo », aperçu de la carte avant
  d'enregistrer, bouton « Revenir à la photo d'origine ». Libellés en français, vouvoiement.
- [x] Sans photo choisie, **rien ne change** : la photo d'origine du code reste affichée.
- [x] Formats acceptés : JPG, PNG, WebP. Taille maximale : 8 Mo. Contrôle du type réel du fichier côté serveur
  (pas seulement l'extension). Texte alternatif = titre de la famille.
- [x] Stockage : même mécanisme que la galerie photo existante (Vercel Blob privé, servi par une route publique dédiée
  ou existante), rattaché au `companyId` de Spirit. **De préférence sans migration** : stocker la référence de la photo
  dans le même champ que les textes personnalisés Spirit si c'est propre ; sinon migration additive
  `scripts/<nom>-migration.sql`, **appliquée par Clément uniquement**.
- [x] Remplacer une photo supprime l'ancienne du stockage (pas de fichiers orphelins), une fois la nouvelle enregistrée.

## À établir pendant l'AUDIT

- Où sont stockés les textes Spirit (colonne / JSON de `companies`) et si les photos peuvent y aller sans migration.
- Comment la galerie photo existante téléverse et sert ses images (`/api/photo-gallery-image`) : réutiliser plutôt que recréer.
- Liste exacte des familles et des endroits où chaque image apparaît.

## Critères d'acceptation

- [ ] S1 Tenant Spirit : la section apparaît ; tout autre tenant : section absente ET action serveur refusée (test).
- [ ] S2 Isolation : le tenant B ne peut ni lire, ni remplacer, ni supprimer une photo du tenant A (companyId côté serveur uniquement).
- [ ] S3 Fichier refusé : mauvais type réel, plus de 8 Mo, famille inconnue → message clair, rien n'est enregistré.
- [ ] S4 Photo choisie → affichée sur la carte du configurateur et sur la page de la prestation ; « Revenir à l'origine » → photo du code.
- [ ] S5 Sans photo choisie : rendu du site Spirit strictement identique à aujourd'hui (test de rendu).
- [ ] S6 Remplacement : l'ancien fichier est supprimé du stockage après succès, jamais avant.
- [ ] S7 Rôles : seuls OWNER et ADMIN de Spirit peuvent modifier (comme les textes).
- [ ] S8 Le nombre de tests en échec et d'erreurs TypeScript n'augmente pas.

## Aperçu

Aperçu obligatoire : la section « Photos des prestations » dans l'admin (mobile 390 px et ordinateur 1280 px), avec
une famille en cours de remplacement et l'aperçu de la carte, puis la carte du configurateur Spirit avant / après.

## Test manuel (Clément, sur la Preview avec le tenant Spirit de dev, puis en production)

Paramètres › Site public › Photos des prestations › changer la photo « Polissage & Céramique » › vérifier la carte
sur le site Spirit et la page Polissage › revenir à l'origine.
