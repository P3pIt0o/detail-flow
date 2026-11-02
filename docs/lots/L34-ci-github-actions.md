# L34 — Tests automatiques sur GitHub à chaque PR (CI)

Risque : CRITIQUE (`.github/**`). Branche partie de `main` (après L33). Premier lot de l'automatisation.

## Objectif
À chaque PR vers `main` (et à chaque push sur `main`), GitHub lance automatiquement typecheck + tests + tests sur base de test, et affiche une coche verte ou une croix rouge dans la PR.

## Constat
- Aucun dossier `.github/workflows/`. `pnpm test` = `vitest run`. pnpm 10, Node 22 (à confirmer à l'audit).
- Dette : 9 tests en échec et 44 erreurs TypeScript sur `main` ; une CI « tout doit passer » serait rouge en permanence.
- Tests BDD ignorés sans `DATABASE_URL` ; abonnements clients via `CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL`.

## Décisions (tranchées, Clément 31/10/2026)
- [x] `.github/workflows/ci.yml` sur `pull_request` vers `main` et `push` sur `main`.
- [x] Liste d'échecs connus versionnée `tests/known-failures.json` (même clé que la baseline du kit) : CI rouge seulement si un test ou une erreur TypeScript n'est PAS dans la liste. Script `scripts/ci-check.mjs`. Échec connu disparu → avertissement (pas d'échec), pour le retirer de la liste.
- [x] Tests BDD avec deux secrets GitHub : `CI_DATABASE_URL` (base dev) et `CI_CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL` (base de test). Garde-fou : refus immédiat si une adresse contient `long-mud` ou si les deux visent le même hôte. Secrets jamais affichés.
- [x] PR de fork : pas de secrets, partie BDD ignorée et signalée.
- [x] Aucune clé Stripe, Resend, Blob ni autre secret dans la CI.
- [x] Cache pnpm ; durée cible < 10 minutes.
- [x] Le kit (`lot.mjs verify`, `dfguard check`) n'est PAS modifié.

## À établir pendant l'AUDIT
- Versions Node et pnpm identiques à Vercel.
- Clé stable des tests/erreurs (logique de clé TypeScript du kit, sans ligne/colonne).
- Fichiers de test qui ont besoin de chaque base.

## Critères d'acceptation
- [ ] C1 Workflow valide, exécuté sur la PR de ce lot, résultat visible dans la PR.
- [ ] C2 `ci-check.mjs` testé : nouvel échec → 1 ; seul échec connu → 0 ; échec connu disparu → 0 + avertissement.
- [ ] C3 Garde-fou base testé (`long-mud`, même hôte → échec immédiat).
- [ ] C4 Aucun secret dans les logs.
- [ ] C5 Le nombre de tests en échec et d'erreurs TypeScript n'augmente pas.

## Aperçu : sans objet — aucun changement visible dans l'application.

## À faire par Clément (une fois)
GitHub › Settings › Secrets and variables › Actions : `CI_DATABASE_URL` (base dev, sans `-pooler`) et `CI_CUSTOMER_SUBSCRIPTIONS_TEST_DATABASE_URL` (base de test). Après fusion : règle de protection de `main` → « Require status checks to pass ».
