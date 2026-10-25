# L26 — Ordre des prestations sur la page « Réserver » (MOYEN)

## Objectif
Le pro choisit l'ordre d'affichage de ses prestations (et catégories) sur sa page de réservation ; l'ordre est stable.

## Dépendances
Aucune. Demande d'un tenant (21/10/2026) : « actuellement c'est tout en désordre ».

## Constat (`main` @ c7c997d, à revérifier)
- `services.sortOrder` existe (défaut 0) ; la réservation publique trie par `sortOrder` SEUL
  (`lib/booking/queries.ts` `getServices`) → à égalité (tout à 0), l'ordre renvoyé par PostgreSQL n'est pas garanti : d'où le désordre.
- L'admin trie par `sortOrder, id` (`lib/admin/catalog-queries.ts`) : l'ordre admin et l'ordre public peuvent différer.
- Aucune action admin ne permet de modifier `sortOrder` des prestations (`app/admin/(dashboard)/prestations/actions.ts`).
- Vérifier aussi : catégories (`serviceCategories.sortOrder`), BookingV2 / widget, sites personnalisés qui lisent les prestations.

## Décisions (tranchées)
- [x] Ordre choisi par le pro, appliqué partout où ses prestations sont listées (réservation, widget, admin).
- [x] Aucun changement de prix, de droits ni de données existantes autre que `sortOrder`.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Interface : flèches monter/descendre (simple, mobile) ou glisser-déposer : ____
- [ ] Ordre par défaut des prestations existantes (toutes à 0) : ordre actuel de l'admin (id) proposé : oui / non

## Périmètre
- Tri déterministe partout : `sortOrder` puis `id` (lecture publique, widget, BookingV2, custom-sites).
- Action serveur de réordonnancement : `requireCompanyMember()`, IDs reçus re-vérifiés comme appartenant au tenant,
  mise à jour en transaction ; idem catégories si présentes.
- UI dans `app/admin/(dashboard)/prestations`.
- Hors périmètre : migration (colonnes déjà présentes), design des cartes, sites personnalisés au-delà du tri.

## Critères d'acceptation
- [ ] Ordre identique entre admin et page « Réserver », stable entre deux chargements.
- [ ] Réordonner ne modifie que `sortOrder` des prestations du tenant courant.
- [ ] Test A/B : le tenant B ne peut pas réordonner (ni lire) les prestations du tenant A, même avec des IDs forgés.
- [ ] Prestations masquées : non affichées, ordre conservé.

## Tests à ajouter
- `tests/services-sort-order.test.ts` : tri déterministe, action de réordonnancement, IDs étrangers refusés (A/B).

## Tests de non-régression (existants)
- Tests booking et custom-sites existants (baseline).
