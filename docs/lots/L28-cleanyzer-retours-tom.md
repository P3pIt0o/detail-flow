# L28 — Cleanyzer : retours de Tom (avant/après, témoignages, 3D au glissement, carte) (MOYEN)

## Objectif
Appliquer les retours de Tom (CLEANYZER) sur le site V3 mis en production : un comparateur avant/après dans la première
section de l'accueil, une section témoignages, une visite 3D pilotée par glissement (plus fluide et plus intuitive sur mobile)
et une carte de zone plus réaliste.

## Dépendances
- L25 (Cleanyzer V3) fusionné et en production. Reprend aussi le lot « poids 3D » prévu après L25 (modèles d'environ 19 Mo dans le dépôt,
  rechargement nécessaire après un échec de la 3D).
- Aucun autre lot sur `components/custom-sites/cleanyzer/**` en parallèle. Les autres tenants ne doivent pas être touchés.

## Constat (à revérifier sur `main` après L25)
- Code du site : `components/custom-sites/cleanyzer/` (`hero.tsx`, `home-page.tsx`, `home-sections.tsx`, `motion.tsx`, `zone-map.tsx`,
  `zone-section.tsx`, `zone.css`, `content.ts`…).
- Visite 3D actuelle pilotée par le défilement vertical : selon Tom, sur mobile il faut comprendre qu'on doit faire défiler vers le bas,
  et remonter fait remonter toute la page. Ce n'est pas intuitif, et la 3D « bug un peu ».
- Carte de zone : stylisée, sans relief ni routes. Zone réelle : 20 km autour du 160 impasse de Grillon, 74330 Choisy.
- Pas de section témoignages.

## Décisions (tranchées)
- [x] Priorités de Tom : avant/après dans la première section de l'accueil, témoignages, 3D au glissement, carte avec relief et routes (Clément, 23/10/2026).
- [x] Aucun changement des autres tenants ni du moteur de réservation ; tout le textile reste sur le formulaire de demande (décision du 14/10).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [x] Avant/après (Clément, 23/10/2026) : **remonter dans la première section de l'accueil les comparateurs avant/après déjà présents plus bas sur la page** ;
  si besoin d'autres paires, utiliser les photos déjà fournies au projet.
- [x] Les photos des comparateurs existants sont de vraies interventions de Cleanyzer (Clément, 23/10/2026) : remontées telles quelles, sans mention d'illustration.
- [x] Section « Ils nous font confiance » : Pinto Maçonnerie, Trofeo Automobiles, Perrin Electric — nom + lien vers leur site
  (`rel="noopener"`), logo seulement avec autorisation ; données dans `content.ts` avec un champ `verified` par citation (Clément, 23/10/2026).
- [x] Accord des trois entreprises et citations **validées par écrit** (Clément, 23/10/2026) : citations affichées avec `verified: true`.
- [x] 3D (Clément, 23/10/2026) : **sur mobile**, glissement horizontal (gauche/droite) avec points de navigation et flèches ; la page ne
  défile pas pendant l'interaction. **Sur ordinateur, le pilotage par défilement actuel est conservé.**
- [x] Carte (Clément, 23/10/2026) : **rester sur le fond bleu actuel, en 2D**, en y ajoutant le **vrai relief** (ombrage) et les **vraies routes**
  autour de Choisy (données OpenStreetMap et modèle de terrain public). **Pas** d'aspect « carte réelle », **pas** de 3D ni d'inclinaison.
  Zone de 20 km conservée. Mention « © OpenStreetMap » obligatoire.

## Réponses du développeur (23/10/2026, avant le plan)
- Témoignages : citation + nom de l'entreprise, sans nom de personne, sans logo, sans note ni étoile ; citations mot pour mot,
  `verified: true` pour les trois. URL non fournies : affichées sans lien (champ `url` optionnel).
  - Perrin Electric — « Une prestation soignée et un travail de qualité. »
  - Trofeo Automobiles — « Un professionnel à la hauteur de nos besoins et de nos attentes. »
  - Pinto Maçonnerie — « Un professionnel sérieux, à la hauteur de nos attentes. »
- Avant/après : comparateur compact ISUZU intérieur dans le héros ; section « Le soin en images » supprimée ; les 3 paires
  de Tom restent plus bas.
- Carte : MapLibre GL depuis jsDelivr (sans dépendance npm), seul `zone-map.tsx` réécrit, communes cliquables, plus de
  boutons de zoom.
- 3D : modèle de secours de 13,4 Mo supprimé, modèle meshopt de 5,8 Mo conservé (dépassement justifié dans le rapport),
  image de repli si le décodeur échoue.

## Notes d'implémentation (carte)
- L'agent n'a pas d'accès réseau : il ne peut pas télécharger les données pour fabriquer une image fixe. Solution attendue par défaut :
  rendu dans le navigateur avec MapLibre GL (gratuit, sans clé), tuiles vectorielles OpenFreeMap pour les routes et tuiles de relief
  publiques (format Terrarium, AWS Terrain Tiles), **style entièrement bleu** (palette actuelle de Cleanyzer), vue figée sur la zone,
  zoom/rotation/inclinaison désactivés, chargement différé quand la section devient visible, repli sur la carte actuelle si erreur.
- Toute nouvelle dépendance (`maplibre-gl`) et tout domaine externe (tuiles) doivent figurer dans le plan ; si une politique CSP bloque
  ces domaines, s'arrêter et le signaler.

## Périmètre
- `components/custom-sites/cleanyzer/**` (et ses assets dans `public/`), contenu dans `content.ts`.
- Avant/après : comparateur glissable (tactile + clavier, poignée accessible, `aria-valuenow`), images optimisées (WebP/AVIF, dimensions fixes, pas de décalage de mise en page).
- 3D : glissement horizontal (pointer events, inertie légère, accrochage aux étapes), pas de capture du défilement vertical de la page,
  bouton « Réessayer » après un échec de chargement (sans recharger la page), repli image si WebGL indisponible.
- Poids 3D : modèles compressés (Draco/Meshopt, textures KTX2/WebP) et, si possible, servis hors du dépôt (Vercel Blob) ; objectif < 5 Mo au total, chargement différé.
- Témoignages : section avec les avis validés, sans faux avis ni note agrégée inventée.
- Carte : fond bleu 2D avec vrai relief et vraies routes (voir notes d'implémentation) ; périmètre de 20 km depuis Choisy conservé.
- Hors périmètre : autres tenants, réservation, prix, domaine personnalisé.

## Critères d'acceptation
- [ ] Mobile (360 px) : la 3D se pilote au doigt, sans faire défiler la page ; retour en arrière fluide ; 60 i/s visés sur un téléphone récent.
- [ ] Ordinateur : pilotage de la 3D par défilement inchangé.
- [ ] Carte : reste bleue et en 2D ; relief et routes réels visibles ; aucune interaction de carte (zoom, rotation) ; la page reste fluide.
- [ ] Échec de chargement 3D : message + « Réessayer » fonctionnel ; repli image si WebGL absent.
- [ ] Avant/après : utilisable au doigt et au clavier ; aucune image ne décale la page au chargement.
- [ ] Témoignages : uniquement les avis fournis/validés ; source indiquée si avis Google.
- [ ] Carte : zone de 20 km autour de Choisy exacte ; attribution présente si fond de carte tiers.
- [ ] Poids : modèles 3D < 5 Mo (ou justification), page d'accueil sans régression notable (Lighthouse mobile avant/après noté dans le rapport).
- [ ] Autres tenants (Spirit ACS, Rozan, standard) et réservation inchangés (diff limité à `cleanyzer/**` et ses assets).

## Tests à ajouter
- Tests unitaires des étapes 3D (navigation, bornes, repli), du comparateur (valeurs, clavier) et du contenu (aucun témoignage sans source).
- Recette manuelle sur le Preview : iPhone/Android + ordinateur.

## Tests de non-régression (existants)
- `tests/custom-sites-*.test.ts`, tests Cleanyzer existants, `tests/spirit-*.test.ts` (baseline, certains déjà en échec avant le lot).
