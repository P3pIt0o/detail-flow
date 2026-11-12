# L55 — Cleanyzer : visite Porsche en vidéo (remplace la 3D), films par prestation, header, réservation néon, présélection des formules

Risque : NORMAL (site custom Cleanyzer uniquement ; aucune donnée, aucun prix, aucun paiement). Branche partie de `main`.
Remplace L38 (design erroné, déjà mergé : `visit-video.tsx` à 6 chapitres = À SUPPRIMER). Tom a validé la vidéo Kling (11/11/2026).
Médias : `L55-medias.zip` (720 fichiers, chemins déjà corrects `public/custom-sites/cleanyzer/…`) → `unzip -o` à la racine du dépôt, sur la branche du lot, puis commit.
Aucune mention de Claude/IA nulle part (code visible, textes, commits). Ne rien toucher hors Cleanyzer.

## A. Visite Porsche en vidéo = même visite qu'avant, mais avec la vidéo
Remplacer la visite 3D / `visit-video.tsx` par un lecteur de vidéo piloté par le défilement (ordinateur) et le swipe (téléphone), MÊME interface que la 3D : une zone à la fois, panneau de prestation de la zone, caméra qui file vite d'une zone à l'autre.
- API inchangée : `goVisit`, `registerVisit`, `useJourney`, `#zone=`, `visitDeepLink`, ancre `CLZ_VISIT_ANCHOR="visite-3d"`, `swipeStops`, `JOURNEY_ZONES`/`zoneAction`. Retirer tout texte « 3D » visible (le mot « visite » suffit).
- Images : `public/custom-sites/cleanyzer/visite-video/pc/f_0001…f_0331.webp` (1280×720) et `…/tel/…` (540×960), 12 images/s, 331 images. Dessiner sur canvas (même technique que `prestations-film.tsx`), préchargement progressif, pas de vidéo `<video>`.
- Arrêts (numéro d'image, base 1) : carrosserie-ouverture 7, carrosserie 31, optiques 61, jantes 91, moteur 133, portière/entrée 168, sièges 217, tapis 257, aérations 279, volant & commandes 313. Chaque défilement/swipe joue le trajet entre deux arrêts (accéléré, ~0,6 s), puis s'arrête sur l'image de la zone. Fin : bouton « Choisir ma formule ».
- Zones : carrosserie → optiques → jantes → moteur → portière/entrée → sièges → tapis → aérations → volant & commandes. Ajouter `entry`, `wheels`, `lights`, `wheel-controls` à `JOURNEY_ZONES` si absentes, en réutilisant les textes/prestations existants (aucun texte de vente nouveau inventé : reprendre ceux des zones actuelles, signaler dans le rapport les zones sans texte).
- Repli : si lecture bloquée / économie de données / `prefers-reduced-motion` → première image fixe + boutons précédent/suivant ; navigation clavier.
- Supprimer les fichiers 3D/anciens chapitres devenus inutiles (`visit-video.tsx/.css`, `public/custom-sites/cleanyzer/visite/`).

## B. Films par prestation (au défilement, comme avant, NOUVELLES vidéos)
Remplacer les bandes (strips) de `public/custom-sites/cleanyzer/film/` : mécanisme inchangé (8 images 720×1280 empilées par fichier `${clip}_${n}.webp`). Supprimer les anciennes bandes (mousse, tapis, audi, volant, moteur, macan).
Nouvelles bandes (déjà dans le zip) et correspondance de `FILM_SEQUENCES` :
- exterieur → `lavage` (8 fichiers)
- NOUVEAU jantes → `jantes` (8) ; NOUVEAU optiques → `optiques` (8)
- habitacle → `habitacle` (6)
- sieges → `sieges911` (6) ; tapis → `tapis911` (4)
- moteur → `moteur911` (6) ; diamond → `porsche911` (6)
Étendre `FilmStepId`/STEPS pour jantes et optiques (reprendre les textes et la formule/zone existants les plus proches ; la présélection de formule de l'action reste via `clzBookingHref`).

## C. Header
`hero.tsx` : mécanisme inchangé (arrivée puis boucle, posters). Nouveaux fichiers dans `public/custom-sites/cleanyzer/neon/` : `hero-arrivee-{720,1080}.mp4`, `hero-boucle-{720,1080}.mp4`, `hero-poster-{720,1080}.webp` (Porsche sale → mousse → propre validée, SANS titre incrusté : le titre et les boutons restent en HTML). Remplacer les anciens du même nom. Vérifier que le texte reste lisible sur la nouvelle image (voile existant ; ajuster l'opacité du voile si besoin, sans changer les textes).

## D. Réservation v2 aux couleurs néon de Tom (Cleanyzer SEULEMENT)
`/reservation` (BookingV2) pour le tenant Cleanyzer : thème sombre néon pour supprimer le décalage avec son site (variables `--clz-neon-*` de `cleanyzer.css` : fond `#04050a`, lignes `rgba(160,180,255,.14)`, texte `#f2f4fa`, discret `rgba(226,232,245,.66)`, bleu `#1f7bff`, rouge `#ff2b45`). Bleu = action principale/sélection, rouge = accent ponctuel (étape active, alerte). Barre du haut et pied de page = ceux du site Cleanyzer. Décalage du haut déjà corrigé (cf. L52 ; ne pas dupliquer). Thème appliqué par une classe/variables portée par la page ou le wrapper uniquement quand le tenant est Cleanyzer (`customSiteKey` du tenant, site personnalisé publié ou en brouillon — décision D8 du développeur) ; aucune autre vitrine touchée ; mode `?embed=1` inchangé. Aucune logique, aucun prix, aucun champ modifié. Contrastes AA.

## E. Présélection de la formule (bug)
Cliquer « Réserver » sur une formule (ex. Éco) doit ouvrir la réservation avec cette formule déjà choisie. Aujourd'hui la plupart des boutons utilisent `CLZ_BOOKING_HREF` générique. Corriger : TOUS les boutons de formule (pages prestations, cartes de formules, panneaux de la visite, films, devis) passent par `clzBookingHref(kind, formulaKey)` ; vérifier `CLZ_SERVICE_IDS` ↔ ids réels de `services` pour Cleanyzer, et que `?service=` est bien lu par `components/booking-v2/booking-v2.tsx` (sinon corriger la lecture, y compris avec le slug du tenant). Test : chaque formule du site Cleanyzer produit un lien avec le bon `service` et la formule apparaît sélectionnée à l'étape 1.

## Critères d'acceptation
- [ ] C1 Visite : défilement (PC) et swipe (tél) parcourent les 10 arrêts dans l'ordre, panneaux corrects, deep links `#zone=` OK, repli sans animation OK (tests + capture).
- [ ] C2 Films : les 8 séquences jouent au défilement avec les nouvelles bandes ; plus aucune référence aux anciennes.
- [ ] C3 Header : nouveaux médias, pas de titre dans la vidéo, texte HTML lisible.
- [ ] C4 Réservation : thème néon uniquement pour Cleanyzer (test : autre tenant inchangé) ; embed inchangé.
- [ ] C5 Présélection : test sur toutes les formules.
- [ ] C6 Aucune mention « 3D » visible, aucune mention de Claude/IA ; poids de page : images chargées à la demande (pas au chargement initial).
- [ ] C7 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant.

## Après fusion (Clément)
Tester cleanyzer.fr sur téléphone + ordinateur : header, visite, films, formule Éco → réservation (présélectionnée), réservation en néon. Montrer à Tom.
