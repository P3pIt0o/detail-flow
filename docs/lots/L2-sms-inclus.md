# L2 — SMS inclus par plan

## Objectif
Chaque plan reçoit automatiquement son quota mensuel de SMS, affiché partout à l'identique.

## Dépendances
**L0** : plans confirmés inchangés (16/10) ; reste la décision D7 (quotas). **Démarre après L15.** Ne pas mener en parallèle de L1 (fichiers `lib/licensing/` communs).

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
- Plans techniques existants : `FREE`, `ESSENTIAL`, `PRO`, `BUSINESS`, `ENTERPRISE`, `FOUNDER` (`lib/licensing/types.ts`).
- Source unique : `SMS_MONTHLY_INCLUDED_BY_PLAN` dans `lib/sms/config.ts` = `{ FREE: 0, PRO: 20 }` ; les plans absents
  ne reçoivent rien. Attribution par `ensureMonthlySmsGrant` (`lib/sms/credits.ts`, `lib/sms/allocation-core.ts`),
  déclenchée notamment depuis `app/api/cron/reminders/route.ts` et `app/admin/(dashboard)/parametres/sms-actions.ts`.
- Packs payants : `SMS_UNIT_PRICE_CENTS = 12`, bonus bêta 20 SMS (hors périmètre).

## Décisions (tranchées)
- [x] FREE = 0 et PRO (Indépendant) = 20 SMS/mois (déjà en production dans le code).
- [x] BUSINESS (Performance) = 50 SMS/mois (Clément, 16/10/2026, P1) : **implémenté dans L15**, pas dans L2.

## Décisions à confirmer
- [ ] SMS inclus par mois pour ENTERPRISE (Équipe) : ____
- [ ] Lifetime / FOUNDER : SMS inclus par mois : ____
- [ ] Les SMS inclus non utilisés restent cumulables sans limite (comportement actuel), ou plafonnés à ____ ?
- [ ] Changement de plan en cours de mois : traité pour Performance par N4 (L16, `PERF-decisions.md` §3) ; règle pour les autres plans : ____

## Périmètre
`lib/sms/config.ts`, `lib/sms/credits.ts`, `lib/sms/allocation-core.ts`, affichages qui lisent déjà la constante.
Hors périmètre : prix des packs, fournisseur AllMySMS, landing (→ L4).

## Critères d'acceptation
- [ ] Les quotas de `SMS_MONTHLY_INCLUDED_BY_PLAN` sont exactement ceux confirmés.
- [ ] Attribution idempotente : relancer l'attribution le même mois ne crédite pas deux fois (y compris deux appels concurrents).
- [ ] Changement de plan en cours de mois : comportement confirmé ci-dessus, testé.
- [ ] Isolation : l'attribution d'un tenant ne modifie jamais le solde d'un autre (test).
- [ ] Aucun SMS réel envoyé pendant les tests (AllMySMS jamais appelé, envoi simulé).
- [ ] Packs achetés et SMS inclus cumulés correctement, sans double crédit (test).

## Tests à ajouter
- Attribution par plan (dont Lifetime), double appel même mois, passage au mois suivant, changement de plan, tenant A/B.

## Tests de non-régression (existants)
`tests/sms-allocation-origin.test.ts`, `tests/sms-hardening-v2.test.ts`, `tests/sms-pack-checkout.test.ts`,
`tests/licensing-sms.test.ts`, `tests/licensing-sms-hardening.test.ts`, `tests/licensing-sms-hardening-structure.test.ts`,
`tests/sms-allmysms-subaccount-param.test.ts`
