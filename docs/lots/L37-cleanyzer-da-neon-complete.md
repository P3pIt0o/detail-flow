# L37 — Cleanyzer : DA néon sur tout le site + en-tête de la maquette

Risque : NORMAL (site personnalisé Cleanyzer uniquement, aucune migration). Branche partie de `main` APRÈS fusion de L35.
Référence visuelle : `docs/lots/L35.apercu.html` (maquette validée par Tom). Constat fait par Clément sur la Preview
L35 le 04/11/2026 : seuls le haut de page et les nouvelles sections sont en néon ; le reste du site est resté dans
l'ancienne DA claire, et l'en-tête n'est pas celui de la maquette.

## Périmètre
`components/custom-sites/cleanyzer/**`, `app/cleanyzer-preview/**` et leurs tests. Aucun autre tenant ne change.
Aucun changement de contenu, de liens, de prix, de SEO ni de fonctionnement (réservation, devis, 3D, carte, FAQ).

## Décisions (tranchées, Clément 04/11/2026)

### 1. DA néon sur tout le site (accueil ET sous-pages)
- [x] Fond nuit `#04050a`, surfaces `#0a0c14`, texte clair, filets bleutés : mêmes valeurs que la maquette
  (`--ink`, `--ink-2`, `--fg`, `--fg-muted`, `--line`, `--neon-blue #1f7bff`, `--neon-red #ff2b45`).
- [x] Méthode : passer les jetons « base claire » de `.cleanyzer` (cleanyzer.css : `--clz-bg`, `--clz-surface`,
  `--clz-surface-2`, `--clz-fg`, `--clz-muted`, `--clz-line`) aux valeurs sombres de la maquette, puis corriger les
  composants qui utilisent des couleurs en dur (`bg-white`, `text-black`, gris clairs…). Pas de section claire restante.
- [x] Titres de section comme la maquette : Fraunces, mot en italique coloré néon avec halo (`text-shadow`),
  libellé en capitales espacées au-dessus.
- [x] Avant/après : cartes avec liseré néon rouge, poignée ronde rouge et lueur (comme la maquette), étiquettes
  « Avant » / « Après » en pastilles sombres.
- [x] Fonds de section : léger dégradé radial rouge ou bleu en coin, comme la maquette (pas d'animation ajoutée).
- [x] Boutons : principal bleu néon avec halo ; secondaire contour clair. Contraste AA vérifié partout.
- [x] Carte de zone d'intervention, FAQ, témoignages, avis, réservation, formulaire de devis : lisibles sur fond
  sombre (texte, champs, focus visibles). La carte interactive reste en place et fonctionnelle.

### 2. En-tête conforme à la maquette
- [x] Une seule ligne, jamais de retour à la ligne (`white-space: nowrap`) : logo Cleanyzer à gauche, liens
  « Prestations · Réalisations · À propos · Zone », à droite « Devis » (secondaire, petit) et « Réserver » (principal).
- [x] « Questions fréquentes » quitte l'en-tête (reste dans le pied de page et la page FAQ).
- [x] « Devis » mène à la demande personnalisée (textile) ; « Réserver » à BookingV2 (inchangé).
- [x] En dessous de 1100 px : menu burger (existant) avec tous les liens, dont FAQ et Devis.
- [x] Sur le haut de page : en-tête transparent sur la vidéo ; au défilement : fond nuit translucide flouté.

### 2 bis. Oublis complétés (04/11/2026)
- [x] Pied de page, sous-pages (Intérieur, Extérieur, Textile, Tarifs, Réalisations, À propos, FAQ, zones), page de
  réservation et formulaire de devis : même DA nuit néon.
- [x] **BookingV2 est partagé entre tous les tenants** : aucun changement dans ses composants communs. Son habillage
  sombre se fait uniquement via des styles limités à `.cleanyzer` (ou les jetons de thème déjà prévus par tenant).
  Si ce n'est pas possible sans toucher au composant commun : le signaler, ne rien modifier.
- [x] Haut de page mobile (390 px) conforme à la maquette : titre centré en haut, voiture en dessous, ligne des métiers
  et pastille d'avis sans chevauchement. Capture dans le rapport.
- [x] Pilule de contact : style exact de la maquette (Réserver en dégradé bleu → violet → rouge, Appeler et WhatsApp
  en contour), fond nuit translucide.
- [x] `theme-color` du navigateur mobile en `#04050a` sur le site Cleanyzer.
- [x] Petit correctif L35 : quand la boucle prend le relais (arrivée trop lente ou en erreur), mettre la vidéo
  d'arrivée en pause pour qu'elle ne continue pas à se télécharger (`intro.pause()` dans `toLoop`) + test.
- [x] Logo : garder le logo rond de Tom dans l'en-tête (son identité), taille adaptée à la ligne unique.

### 3. Barre « MAQUETTE » de `/cleanyzer-preview`
- [x] Elle reste réservée à la route interne `/cleanyzer-preview` (jamais sur le site public `/p/cleanyzer`) :
  ajouter un test qui le fige.

## Critères d'acceptation
- [ ] C1 Aucune section à fond clair sur l'accueil et les sous-pages (test sur les jetons + liste des couleurs en dur
  retirées dans le rapport).
- [ ] C2 En-tête sur une ligne à 1100, 1366 et 1920 px ; burger en dessous (test + captures dans le rapport si possible).
- [ ] C3 Carte de zone, 3D, vidéo de Tom, réservation, devis, FAQ : fonctionnement inchangé (tests existants verts).
- [ ] C4 Contraste texte/fond ≥ 4,5:1 pour le texte courant (vérifié sur les jetons).
- [ ] C5 Aucun autre tenant impacté ; tests en échec et erreurs TypeScript : pas plus qu'avant (CI verte).
