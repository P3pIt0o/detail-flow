# L3 — Facturation annuelle des abonnements SaaS

## Objectif
Un pro peut payer son abonnement DetailFlow à l'année depuis le checkout, avec le prix annuel que tu fixes.

## Dépendances
**L0** : 4 offres et prix mensuels confirmés (16/10) ; restent D1 (HT/TTC), D8 (annuel), D9 (promotion), D10 (cumuls). Compatibilité avec la fidélité **déjà en place** (voir L7) à décider avant de coder.
Ne pas mener en parallèle de L1, L7, L8 (fichiers `lib/billing/` communs).

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
- Seuls Essentiel et Indépendant sont en vente libre ; Performance et Équipe sont « bientôt » (`availability: "coming_soon"`).
- La fidélité s'applique déjà par coupons Stripe posés sur `invoice.created` (`lib/billing/loyalty-coupons.ts`) : une facture annuelle serait concernée.
- Prix mensuels dans `lib/pricing/plans.ts` : Indépendant 19,90 €, Performance 34,90 €, Équipe 59,90 € (`monthlyPriceCents`).
- Price IDs mensuels via `STRIPE_PRICE_INDEPENDANT_MONTHLY`, `STRIPE_PRICE_PERFORMANCE_MONTHLY`, `STRIPE_PRICE_EQUIPE_MONTHLY`
  (`.env.example`), créés par `scripts/setup-stripe-billing-products.ts` (script que SEUL le développeur exécute).
- Checkout/portail/webhook : `lib/billing/subscription-checkout.ts`, `subscription-portal.ts`, `subscription-webhook.ts`,
  route `app/api/billing/webhook/route.ts`.

## Décisions (tranchées)
- [x] Convention technique (non commerciale) : Price IDs annuels en variables d'environnement
  `STRIPE_PRICE_<PLAN>_YEARLY`, documentées dans `.env.example`, jamais commitées ; checkout refusé (échec fermé) si absente.

## Décisions à confirmer
- [ ] Prix annuels exacts (HT ou TTC ?) : Indépendant ____ · Performance ____ · Équipe ____
- [ ] Plans proposés en annuel dès maintenant (Équipe inclus ?) : ____
- [ ] Passage mensuel ↔ annuel en cours d'abonnement : autorisé ? prorata Stripe ? : ____
- [ ] Remise de fidélité existante (`STRIPE_COUPON_LOYALTY_*`) cumulable avec l'annuel ? : ____
- [ ] (L0-D9/D10) Promotion de lancement (si elle existe) cumulable avec l'annuel ? : ____
- [ ] Renouvellement annuel : rappel avant échéance ? Annulation en cours d'année : remboursement au prorata ou non ? : ____
- [ ] Abonnés historiques mensuels : aucun changement automatique (à confirmer) : ____
- [ ] Affichage par défaut sur la page tarifs : mensuel ou annuel ? : ____

## Périmètre
`lib/pricing/plans.ts`, `lib/billing/subscription-*.ts`, `lib/billing/config.ts`, `.env.example`, sélecteur sur la page tarifs.
Le script `scripts/setup-stripe-billing-products.ts` peut être modifié mais JAMAIS exécuté par Claude.
Hors périmètre : Lifetime, commissions, coupons existants, prix mensuels (confirmés inchangés), plans historiques.

## Critères d'acceptation
- [ ] Le checkout crée l'abonnement avec le Price annuel ou mensuel selon le choix, et le bon plan.
- [ ] Le webhook reconnaît un Price annuel et attribue le bon plan (test avec événement simulé, signature vérifiée).
- [ ] Price ID annuel absent → erreur claire, aucun checkout au mauvais prix (test).
- [ ] Prix annuel affiché = prix facturé (même constante source, test).
- [ ] Les abonnements mensuels existants ne changent pas de comportement.
- [ ] Aucun script de création de produits/prix Stripe exécuté par l'agent (création des Price IDs faite par toi).

## Tests à ajouter
- Sélection du Price par plan × période, variable manquante, webhook annuel, idempotence du webhook rejoué.

## Tests de non-régression (existants)
`tests/billing-subscriptions.test.ts`, `tests/billing-config.test.ts`, `tests/saas-billing-admin.test.ts`,
`tests/pricing-source.test.ts`, `tests/pricing-plan-details.test.ts`, `tests/subscription-billing-schema.test.ts`,
`tests/billing-lifetime.test.ts`, `tests/lifetime-checkout.test.ts` · (BDD) `tests/subscription-billing-migration.integration.test.ts`
