# L11 — Audit des sites personnalisés et de l'administration (MOYEN ; CRITIQUE si droits/tenants corrigés)

## Objectif
Vérifier que chaque type de tenant (standard, site personnalisé, widget seul, interne) fonctionne et n'expose jamais les données
d'un autre, sans écraser les réglages spécifiques des clients.

## Dépendances
Audit en lecture seule possible maintenant. Ne pas implémenter en parallèle de `feat/cleanyzer-v3-integration` (branche active du 15/10).

## Constat (16/10/2026, `main` @ c7c997d)
- Sites personnalisés enregistrés (`customSiteKey`) : **`cleanyzer`, `rozan`, `spirit-acs`** — `components/custom-sites/`, `lib/custom-sites/`
  (`meta.ts` = source des clés valides, `registry.ts`, `server.ts`). Aperçus : `app/cleanyzer-preview`, `app/rozan-preview`.
- **JustClean n'est pas un site personnalisé dans le code** (aucune clé) : sa page de réservation tourne sur DetailFlow ; son site
  vitrine est externe. Le mot « JustClean » n'apparaît que comme exemple dans des contenus marketing/onboarding.
- Branches non fusionnées concernées : `feat/cleanyzer-v3-integration` (15/10), `fix/spirit-acs-*` (fin août), `v0/rozan-cleaning-services-*`, `v0/spirit-acs-site-*`.
- **Règle confirmée (16/10/2026) : `feat/cleanyzer-v3-integration` est préservée intégralement** (ni modification, ni rebase,
  ni fusion, ni suppression par un agent ; branche protégée dans le kit, lecture seule). Toute correction touchant Cleanyzer attend
  ta décision sur cette branche.
- Admin : `app/admin/(dashboard)/` (`analyse`, `demandes`, `clients`, `factures`, `reservations`, `parametres`, `site-personnalise`…),
  garde `requireCompanyMember()`.
- Tests existants : `custom-sites-registry`, `custom-sites-server`, `super-admin-custom-site`, 14 fichiers `spirit-*`, `admin-tenant-resolution`,
  `admin-actions-membership-guard`, `admin-client-actions-authz`, `admin-logo-authz`.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Liste des anomalies déjà connues par client (Spirit ACS, Rozan, Cleanyzer, JustClean) : ____
- [ ] Sort des branches non fusionnées listées ci-dessus : ____
- [ ] Tenant « interne » : lequel, et quelles règles : ____

## Périmètre
Rapport d'audit (lecture seule), puis corrections validées une par une. Hors périmètre : refonte visuelle des sites clients.

## Critères d'acceptation
- [ ] Matrice testée : tenant standard / personnalisé / widget seul / interne × (voir mon site, URL, branding, emails, formulaires, widget).
- [ ] Pages admin analyse, demandes/devis, clients, factures : test A/B prouvant qu'aucune donnée d'un tenant n'apparaît chez un autre.
- [ ] Réglages spécifiques des sites clients inchangés (diff vide sur `components/custom-sites/**` sauf correction approuvée).

## Tests de non-régression (existants)
Fichiers listés dans le constat (dont tous les `tests/spirit-*.test.ts`).
