# L25 — Site Cleanyzer V3 (visite 3D, film, avant/après) en prépublication

Risque : **critique**, car le layout, les robots, la canonique, le JSON-LD et le sitemap sont communs à tous les
tenants. Plan approuvé : `.lot-state/L25.plan.md`.

## Origine
- Fusion de `origin/feat/cleanyzer-v3-integration` : 12 commits, base `c7c997d`, soit 25 commits avant le `main`
  de L23.
- Fusion faite par le développeur après la baseline, commit `3560be5`. Aucun conflit.

## Ce qu'apporte la branche
- Site Cleanyzer V3 :
  - visite 3D interactive d'un véhicule, reliée aux prestations ;
  - film des prestations ;
  - comparateur avant/après et réalisations de Tom ;
  - pages SEO (prestations, zones) et FAQ.
- SEO partagé, avec effet limité à Cleanyzer par des tables fermées :
  - canonique sur `/p/cleanyzer` (`TENANT_PATH_CANONICAL`) ;
  - visuels de partage propres ;
  - `@id` LocalBusiness stable, à activer explicitement (opt-in).
- **Prépublication** :
  - `noindex,follow` imposé à Cleanyzer (`PREPUBLICATION_NOINDEX_SITE_KEYS`) sur les pages et dans les métadonnées ;
  - Cleanyzer absent du sitemap.

## Ajouts L25 par-dessus la fusion
- **Intégrité des scripts du CDN.**
  - `three@0.147.0` (`three.min.js`, `GLTFLoader.js`) est chargé avec `integrity` (sha384) et
    `crossOrigin="anonymous"`.
  - `meshopt_decoder.js` est servi depuis `/public`, donc sans SRI.
- **Échec de la 3D** (hash, réseau, modèle) : passage en version légère (liste des zones, « Voir en vidéo »), sans
  bouton « Lancer la visite 3D » et sans erreur bloquante.
- **Textes** : « Voir la zone sur le véhicule 3D ». L'attribution CC BY 4.0 (Sketchfab, n.brizitskaya) est conservée.
  Les photos réelles de Tom (réalisations, `porsche-lavage`, `porsche-interieur`) gardent le nom de la voiture.

## Vérifié sans modification
- Aucune migration, variable d'environnement, dépendance ni modification de `next.config`.
- Modèle de 13,4 Mo (`porsche-911-raw-glb.wasm`) : jamais chargé en parallèle du 5,8 Mo, et jamais automatiquement
  en mode léger. Il n'est demandé qu'en repli, dans trois cas :
  - échec du modèle de 5,8 Mo ;
  - décodeur en échec ;
  - décodeur absent.
- Réservation Booking V2 : aucun fichier de réservation modifié. Le paramètre `?service=<id>` existait déjà.

## Tests
- `tests/l25-indexation-tenants.test.ts` :
  - Spirit ACS et Rozan restent indexables, sur les deux chemins (`resolvePublicPageRobots` et
    `buildTenantMetadata`) ;
  - Cleanyzer seul est en `noindex,follow` ;
  - le sitemap contient Spirit ACS et Rozan, et aucune URL Cleanyzer.
- `tests/l25-visite-3d.test.ts` :
  - SRI au bon format, version figée ;
  - échec : version légère, sans bouton « Lancer » ;
  - repli séquentiel du modèle lourd ;
  - pas de « Porsche » dans les textes 3D, attribution conservée.

## Pour plus tard
- **Lot « poids 3D »** :
  - optimisation des deux modèles ;
  - cas du navigateur sans WebAssembly, qui charge directement le modèle de 13,4 Mo (le passer en version légère) ;
  - « mode léger » basé sur la mémoire et les cœurs, et non sur « mobile ».
- **Mise en ligne officielle** : retirer Cleanyzer de `PREPUBLICATION_NOINDEX_SITE_KEYS`, l'ajouter au sitemap,
  connecter le domaine.
