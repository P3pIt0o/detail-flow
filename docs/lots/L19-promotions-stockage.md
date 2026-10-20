# L19 — Promotions et stockage

## Objectif
Le pro peut enregistrer ses offres de réduction (multi-prestations, prestation + option, multi-options), ses équivalences de panier et ses compléments suggérés, isolés par entreprise. Rien n'est encore appliqué aux réservations.

## Dépendances
L17-B (moteur pur, 3 patches) — appliqué dans la branche du lot. Lots suivants : branchement réservation/paiement (L17-D), panier Booking V2 (L17-E), interface « Offres & réductions » (L17-F).

## Constat dans le code (20/10/2026, `main` @ 075edd5)
Aucune table de promotions ; codes promo dans `lib/promo/service.ts` (inchangés). Méthode d'accès tolérant à l'absence de migration : `lib/services/highlight-store.ts`. Fuseau par entreprise : `companies.timezone`. PGlite disponible pour les tests de migration.

## Décisions (tranchées)
Voir `.lot-state/L19.plan.md` § Décisions (toutes tranchées le 20/10/2026), dont : gestion des offres réservée au propriétaire et aux administrateurs.

## Décisions à confirmer
Aucune.

## Périmètre
Voir `.lot-state/L19.plan.md` § Fichiers. Hors périmètre : schéma Drizzle, réservation, paiement, facture, codes promo, interface.

## Critères d'acceptation
- [ ] 120 tests L17-B + tests L19 verts ; aucun nouvel échec par rapport à la baseline.
- [ ] Tenant B ne lit, ne modifie, ne duplique ni ne supprime une offre/règle de A (tests).
- [ ] Avant migration : aucune erreur, aucune requête sur les nouvelles tables.
- [ ] Migration rejouable deux fois sous PGlite sans erreur.
- [ ] Aucun fichier existant modifié.

## Tests de non-régression (existants)
`tests/promo-targeting.test.ts`, `tests/booking-quote-tenant-isolation.test.ts`, `tests/settings-nav.test.ts`.
