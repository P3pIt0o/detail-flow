# L1 — Commissions par plan

## Objectif
La commission prélevée par DetailFlow sur les paiements en ligne d'un pro correspond exactement à la grille de son plan.

## Dépendances
**L0** : les 4 offres et leurs prix sont confirmés (16/10) ; restent à trancher les décisions D3 à D6 de L0 (reprises ci-dessous). Ne pas mener en parallèle de L3, L7, L8 (fichiers `lib/billing/` communs).

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
- Paiements en ligne (réservations) : `COMMISSION_RULES` dans `lib/billing/commercial-rules.ts`, appliqué par
  `lib/payments/config.ts` et `lib/payments/queries.ts` (via `resolveCommercialCommission`), plafond mensuel calculé par
  `computeCappedPlatformFeeCents` et journalisé par `lib/payments/platform-fee-ledger.ts`.
  Valeurs actuelles : FREE 2 % plafond 19,90 € · PRO 1 % plafond 5 € · BUSINESS 0,5 % plafond 5 € · ENTERPRISE 0,25 % plafond 6 € ·
  Lifetime 0 %.
- Plans historiques `ESSENTIAL`, `FOUNDER` ou inconnus : **taux de repli global, sans plafond** (`source: "fallback"`). Surcharge possible par
  super-admin (`platformFeeBps`, garde le plafond du plan).
- Remboursements : `lib/payments/refunds.ts` (n'envoie `refund_application_fee` que si une commission a été prise).
- Signalé par toi le 13/10 : un tenant pour lequel les commissions n'ont pas été reçues (nom communiqué hors dépôt) → à diagnostiquer pendant l'audit.
- Abonnements d'entretien vendus par les pros : système DISTINCT (`lib/customer-subscriptions/plan-policy.ts`,
  `resolvePlatformFeeBps`), le code interdit explicitement d'y utiliser `commercial-rules.ts`.

## Décisions (tranchées)
Aucune décision n'est considérée comme acquise sans ta confirmation ci-dessous.

## Décisions à confirmer
- [ ] (L0-D3) Plan Équipe (ENTERPRISE) : commission sur les paiements en ligne = 0 % et plafond 0 (évoqué en octobre 2026 — confirme), ou valeur actuelle 0,25 % / 6 € : ____
- [ ] (L0-D4) FREE / PRO / BUSINESS : taux et plafonds actuels conservés tels quels ? (oui / nouvelles valeurs) : ____
- [ ] (L0-D6) La commission des abonnements d'entretien (`plan-policy.ts`) doit-elle suivre la même grille, ou reste-t-elle séparée ? : ____
- [ ] (L0-D5) Plans historiques `ESSENTIAL` / `FOUNDER` (préservés) : taux et plafond (aujourd'hui repli sans plafond) : ____
- [ ] Changement de plan en cours de mois : le plafond déjà atteint dans le mois reste acquis, ou on recalcule ? : ____

## Périmètre
`lib/billing/commercial-rules.ts` et, selon la 3e décision, `lib/customer-subscriptions/plan-policy.ts`.
Affichages qui citent ces taux : uniquement s'ils lisent déjà la constante (sinon → L4).
Hors périmètre : prix des abonnements (confirmés inchangés), plans techniques (aucun supprimé), Stripe Connect onboarding, migrations.

## Critères d'acceptation
- [ ] Les valeurs de `COMMISSION_RULES` sont exactement celles confirmées ci-dessus.
- [ ] Pour un plan à 0 %, aucun `application_fee_amount` n'est envoyé à Stripe (ou il vaut 0), testé au niveau de la fonction qui construit les paramètres Stripe.
- [ ] Plafond mensuel : atteint en cours de mois → commission 0 jusqu'au mois civil suivant (fuseau du tenant), testé.
- [ ] Lifetime reste à 0 % quel que soit son `licensePlan`.
- [ ] Remboursement partiel et total : commission remboursée proportionnellement ou non selon la règle existante, testé ; aucune double commission.
- [ ] Webhook rejoué : aucune commission ni écriture de ledger en double (test).
- [ ] Le ledger des commissions d'un tenant n'est ni lisible ni modifiable par un autre tenant (test A/B négatif).
- [ ] Aucun paiement réel : Stripe simulé dans tous les tests.
- [ ] Aucun taux codé en dur ailleurs que dans les constantes sources (preuve par recherche dans le rapport).

## Tests à ajouter
- Un cas par plan (taux et plafond), plafond exactement atteint, dépassé, changement de mois civil (Europe/Paris et autre fuseau),
  arrondi d'un montant impair en centimes, plans historiques, surcharge super-admin, remboursements partiel/total, webhook rejoué,
  isolation du ledger A/B.

## Tests de non-régression (existants)
`tests/billing-commercial-rules.test.ts`, `tests/platform-fee-ledger.test.ts`, `tests/payment-lot-a.test.ts`,
`tests/launch-lot1-hardened.test.ts`, `tests/customer-subscriptions-plan-policy.test.ts`, `tests/licensing-enterprise.test.ts`,
`tests/pricing-source.test.ts`, `tests/refunds.test.ts` · (BDD) `tests/platform-fee-ledger.integration.test.ts`
