# L7 — Fidélité des abonnements DetailFlow (CRITIQUE)

## Objectif
Garantir que la réduction fidélité s'applique exactement selon le barème validé, une seule fois par facture, sur
l'abonnement DetailFlow uniquement, et l'afficher clairement au pro.

## Dépendances
L0 (D9 promotion, D10 cumuls) et L3 (prix annuels) **avant de coder** ; prix mensuels confirmés inchangés. L'audit peut se faire maintenant.

## Constat dans le code (16/10/2026, `main` @ c7c997d) — la fidélité EXISTE DÉJÀ
La feuille de route présente L7 comme « nouveau », mais le mécanisme est déjà implémenté sur `main` :
- Barème `LOYALTY_DISCOUNT_TIERS` = 0 % (0 mois), 5 % (6), 10 % (12), 15 % (18), 17,5 % (24), 20 % (30+), plafond
  `MAX_LOYALTY_DISCOUNT_BPS = 2000` — `lib/billing/commercial-rules.ts`. **Identique au barème validé.**
- Ancienneté = mois calendaires complets depuis `companies.continuousSubscriptionStartedAt` (`getFullCalendarMonthsElapsed`,
  calcul en **UTC**), date posée à la première facture réellement payée (`startContinuousSubscriptionIfNull`, essai exclu),
  remise à `NULL` uniquement à la fin effective de l'abonnement — `lib/billing/subscription-server.ts`.
- Application par coupons Stripe `STRIPE_COUPON_LOYALTY_5|10|15|17_5|20` (`duration=forever`, jamais en code promo public),
  posés par le webhook `invoice.created` avec `idempotencyKey` — `lib/billing/loyalty-coupons.ts`, `lib/billing/subscription-webhook.ts`,
  décision `decideInvoiceLoyaltyDiscount` (`lib/billing/subscription-core.ts`).
- Tests existants : `tests/billing-commercial-rules.test.ts`, `tests/billing-subscriptions.test.ts`.
- **Absent** : affichage du palier courant / prochain palier côté admin (aucune référence UI trouvée).

## Règles confirmées (feuille de route ; barème reconfirmé par toi le 16/10/2026)
- [x] **Ne pas recréer la fonctionnalité : commencer par auditer l'implémentation existante (`/audit L7`).**
- [x] Barème 0–5 mois 0 % · 6 mois 5 % · 12 mois 10 % · 18 mois 15 % · 24 mois 17,5 % · 30 mois et plus 20 % max.
- [x] Départ au premier abonnement réellement payé (hors essai).
- [x] Ancienneté conservée lors d'un changement de formule sans interruption.
- [x] Remise à zéro après résiliation effective ; résiliation programmée sans perte anticipée.
- [x] Réduction sur l'abonnement DetailFlow uniquement, jamais sur commissions, SMS ou autres frais.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Impayé (facture en échec, `past_due`) : l'ancienneté continue, est suspendue, ou repart à zéro ? À partir de quel délai ? : ____
- [ ] Pause / suspension d'abonnement (si elle existe) : même question : ____
- [ ] Fuseau de référence pour le passage de palier : UTC (code actuel) ou fuseau du tenant ? : ____
- [ ] Cumul avec la promotion de lancement (L0) : ____
- [ ] Prix annuels (L3) : la fidélité s'applique-t-elle à une facture annuelle ? Palier figé à la date de facturation ? : ____
- [ ] Passage de palier en cours de période : appliqué à la prochaine facture seulement (comportement actuel attendu) : ____
- [ ] Affichage côté pro (palier actuel, prochain palier, date) : maquette validée ? : ____

## Périmètre (après audit et décisions)
Écarts constatés entre le code et les règles, tests manquants, affichage du palier si validé.
Hors périmètre : modification du barème, création de coupons Stripe (faite par toi via `scripts/setup-stripe-loyalty-coupons.ts`).

## Critères d'acceptation
- [ ] Rapport d'audit : chaque règle confirmée → fonction/test qui la prouve, ou écart documenté.
- [ ] Aucune implémentation parallèle : toute évolution passe par `LOYALTY_DISCOUNT_TIERS` et le webhook existant.
- [ ] Le coupon d'un palier est appliqué au plus une fois par facture ; webhook rejoué = sans effet ; aucun cumul de coupons inattendu.
- [ ] La réduction ne touche ni commissions, ni SMS, ni Lifetime.
- [ ] Cohérence Stripe / base / UI / factures sur un scénario Preview documenté.

## Tests à ajouter (si absents après audit)
Frontières 6/12/18/24/30 mois (veille, jour J, lendemain), 31 janvier → fin février, fuseau, essai puis paiement, échec de
paiement, annulation programmée puis effective, changement de plan sans interruption, webhook rejoué, deux webhooks concurrents,
coupon inconnu déjà présent, variable `STRIPE_COUPON_LOYALTY_*` manquante, isolation tenant A/B.

## Tests de non-régression (existants)
`tests/billing-commercial-rules.test.ts`, `tests/billing-subscriptions.test.ts`, `tests/saas-billing-admin.test.ts`,
`tests/subscription-billing-schema.test.ts` · (BDD) `tests/subscription-billing-migration.integration.test.ts`
