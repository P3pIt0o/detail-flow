# L99 — Lot pilote : corriger le README obsolète (Phase 0, risque FAIBLE)

## Objectif
Valider tout le cycle `/lot` (branche, baseline, plan, approbation, implémentation, vérification, rapport) sur un changement
purement documentaire, sans Stripe, sans base, sans décision commerciale.

## Dépendances
Kit installé, `dfguard init` et `doctor` OK.

## Constat (16/10/2026, `main` @ c7c997d)
`README.md` décrit encore « PostgreSQL + Prisma (schéma prêt) » et une « Phase 1 site vitrine », alors que le projet utilise
Drizzle (`lib/db/schema.ts`), Better Auth, Stripe, un moteur de réservation et un mode multi-tenant.

## Décisions (tranchées)
- [x] Changement documentaire uniquement : `README.md` (aucun autre fichier).

## Décisions à confirmer
Aucune.

## Critères d'acceptation
- [ ] La stack décrite correspond à `package.json` et au code (Drizzle, Better Auth, Stripe, Vitest).
- [ ] Les commandes citées existent (`pnpm test`, `pnpm exec tsc --noEmit`) ; `pnpm lint` signalé comme non fonctionnel.
- [ ] Aucune information sensible (URL, clé, nom de base, client) ajoutée.
- [ ] Cycle complet observé : refus d'écriture avant approbation, approbation « oui », `verify` OK, aucun relecteur IA (risque faible), rapport au format obligatoire.

## Tests de non-régression
Suite complète inchangée (baseline).
