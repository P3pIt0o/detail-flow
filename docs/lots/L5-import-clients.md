# L5 — Import de clients

## Objectif
Un pro qui arrive d'un autre outil récupère sa base clients dans DetailFlow sans ressaisie.

## Dépendances
Aucune.

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
- Clients admin : `app/admin/(dashboard)/clients/` (`actions.ts`, `new/`), logique `lib/admin/client-crm.ts`
  (`normalizeEmail`, `normalizePhone`, `classifyMatch`, `dedupeVehicles`), garde `requireCompanyMember()`.
- Limite de plan existante : `maxCustomers` dans `lib/licensing/registry.ts` (illimitée pour plusieurs plans).

## Décisions (tranchées)
- [x] Règle de sécurité (non commerciale) : le `companyId` vient uniquement de `requireCompanyMember()` ; aucune colonne du fichier ne peut le définir.

## Décisions à confirmer
- [ ] Format(s) acceptés : CSV seul, ou aussi Excel ? : ____
- [ ] Colonnes reconnues (nom, prénom, email, téléphone, adresse, véhicule…) : ____
- [ ] Aperçu avant validation : oui / non : ____
- [ ] Taille maximale (lignes ou Mo) : ____
- [ ] Doublon détecté : ignorer, mettre à jour, ou laisser choisir ? : ____
- [ ] Plans qui ont accès à l'import (tous ?) et respect de `maxCustomers` : ____
- [ ] Faut-il une nouvelle table (historique d'import) ? Si oui → migration additive, lot CRITIQUE : ____

## Périmètre
Nouvelle action et page dans `app/admin/(dashboard)/clients/`, parsing côté serveur, `lib/admin/client-crm.ts` si besoin.
Hors périmètre : import de réservations, factures ou véhicules seuls.

## Critères d'acceptation
- [ ] Parsing robuste : séparateurs `;` et `,`, UTF-8 avec BOM, guillemets, lignes vides, export Excel FR.
- [ ] Rapport d'import : créés / mis à jour / ignorés / erreurs avec numéro de ligne.
- [ ] Isolation : un import ne peut ni lire ni modifier un client d'un autre tenant (test A/B).
- [ ] Limite du plan respectée selon la décision ci-dessus (test).
- [ ] Taille maximale appliquée côté serveur (test).
- [ ] Import partiel contrôlé : une ligne invalide n'empêche pas les autres et n'écrit rien de partiel pour elle.
- [ ] Un export ultérieur neutralise l'injection de formules (`=`, `+`, `-`, `@` en début de cellule).

## Tests à ajouter
- Parsing (cas ci-dessus), dédoublonnage email/téléphone, isolation tenant, limite de plan, fichier trop gros.

## Tests de non-régression (existants)
`tests/client-crm.test.ts`, `tests/client-identity.test.ts`, `tests/admin-client-actions-authz.test.ts`,
`tests/licensing-limits.test.ts` · (BDD) `tests/client-profile-db.test.ts`
