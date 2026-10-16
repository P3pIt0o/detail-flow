# L15 — PERF-1b : souscription directe à Performance (CRITIQUE)

## Objectif
Rendre Performance souscriptible (avec essai unique de 30 jours) et lui attribuer ses 50 SMS mensuels, sans toucher aux autres offres.

## Dépendances
- **L14 fusionné par le développeur** (liste blanche active). L13 fusionné.
- Price Performance **en mode test** vérifié par le développeur (procédure : PERF-decisions.md, section D1/P13 et plan v2 §8).
- Ne pas mener en parallèle de L2 (`lib/sms/**` commun) ni de L1.

## Constat dans le code (16/10/2026, `main` @ c7c997d)
- Interrupteurs fermés : `availability: coming_soon` (`lib/pricing/plans.ts`), `SAAS_ADMIN_CHECKOUT_PLANS = ["PRO"]` (`lib/billing/saas-admin.ts`),
  `DESIRED_PLANS = ["PRO"]` (`lib/pricing/desired-plan.ts`), `PLAN_META.BUSINESS.purchasable = false` (`lib/licensing/registry.ts`), textes d'essai
  `PRICING_COPY` limités à Indépendant.
- Essai : `isCompanyTrialEligible` = `subscriptionStartedAt IS NULL`, tous plans confondus ; jamais remis à NULL. **Conforme à P2.**
- SMS : `SMS_MONTHLY_INCLUDED_BY_PLAN = { FREE: 0, PRO: 20 }` et `monthlyIncludedSms()` codé pour FREE/PRO (`lib/sms/config.ts`).
  Crédit idempotent par mois civil (fuseau du tenant), cumulable, jamais repris (`lib/sms/credits.ts`). Le cron
  (`app/api/cron/reminders/route.ts`) sélectionne les entreprises par `licensePlan`.
- **Lifetime = `licensePlan BUSINESS` + `billingMode lifetime`** (`lib/billing/lifetime.ts`). L'offre Lifetime promet « 20 SMS de bienvenue »
  puis des SMS payants.
- Commissions BUSINESS : 0,5 % plafonné à 5 €/mois civil (`COMMISSION_RULES`) ; abonnements clients 0 % (`plan-policy.ts`). **Inchangées.**

## Décisions (tranchées)
- [x] P1 : 50 SMS crédités par mois pour Performance ; Indépendant reste à 20 ; aucun autre quota modifié ; aucun SMS payant hors forfait ajouté (Clément, 16/10).
- [x] P2 : essai de 30 jours sur Performance, une seule fois par entreprise, tous plans confondus (Clément, 16/10).
- [x] P10 : 0,5 % plafonné à 5 € sur les paiements, 0 % sur les abonnements clients, règles existantes inchangées (Clément, 16/10).
- [x] Clients Lifetime protégés : aucun changement de leurs droits ni de leurs SMS sans décision (Clément, 16/10).
- [x] Équipe reste non achetable (Clément, 16/10).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] N2 : libellé public des SMS (« 50 SMS crédités chaque mois, cumulables » proposé) : ____
- [ ] N3a : Lifetime exclu du crédit mensuel de 50 SMS (proposé, conforme à l'offre Lifetime) : oui / non
- [ ] N3b : tenants `BUSINESS` attribués manuellement (`billingMode free`), à lister par la requête de PERF-decisions.md : inclus / exclus / au cas par cas ____
- [ ] N8 : 50 SMS crédités pendant l'essai Performance (comme les 20 SMS pendant l'essai Indépendant) : oui / non
- [ ] Textes d'essai `PRICING_COPY` (Indépendant et Performance) : ____
- [ ] Date d'ouverture (fusion et déploiement décidés par le développeur) : ____

## Périmètre
- Les 5 interrupteurs ci-dessus, **seulement pour `BUSINESS`**.
- `lib/sms/config.ts` (`BUSINESS: 50`, `monthlyIncludedSms` selon N3), `lib/sms/credits.ts` et `app/api/cron/reminders/route.ts`
  (exclusion selon `billingMode`), `app/admin/(dashboard)/parametres/page.tsx` (quota affiché).
- Note SMS Performance dans `pricing-data.ts` et `faq-data.ts` (l. 44).
- `app/demarrer/page.tsx`, `app/demarrer/onboarding.tsx`, `app/admin/creer-mon-espace/**` : intention `BUSINESS` acceptée, **aucun droit accordé**.
- **Hors périmètre (interdit) :** `ENTERPRISE`, quotas FREE/PRO, prix, `COMMISSION_RULES`, `plan-policy.ts`, `PLAN_MATRIX`, coupons, objets Stripe,
  migrations, changement de formule (→ L16), complément SMS d'upgrade (→ L16, N4).

## Critères d'acceptation
- [ ] B1 Checkout `BUSINESS` avec le Price de `STRIPE_PRICE_PERFORMANCE_MONTHLY` ; essai seulement si `subscriptionStartedAt` est vide.
- [ ] B2 Checkout `ENTERPRISE` refusé côté serveur, y compris par appel direct à l'action.
- [ ] B3 Crédits mensuels : FREE 0, PRO 20 (inchangés) ; BUSINESS abonné 50 ; Lifetime selon N3a ; ESSENTIAL, ENTERPRISE, FOUNDER, `licensePlan` NULL inchangés.
- [ ] B4 Idempotence : deux passes du cron, ou cron + ouverture des paramètres, dans le même mois → un seul crédit ; deux appels concurrents → un seul crédit.
- [ ] B5 Changement de mois dans le fuseau du tenant (cas 23 h 30 UTC) correct.
- [ ] B6 Commission BUSINESS 0,5 % au centime ; plafond 5 € atteint puis dépassé ; compteur mensuel commun aux plans.
- [ ] B7 Remboursement avec et sans restitution de commission ; registre cohérent.
- [ ] B8 Abonnements clients BUSINESS à 0 %, taux recalculé à chaque facture.
- [ ] B9 Droits serveur : PRO refusé sur prospects et analyse avancée ; BUSINESS autorisé ; isolation A/B sur les prospects.
- [ ] B10 Cartes, comparateur, FAQ et admin affichent les mêmes quotas et les mêmes textes d'essai.

## Tests à ajouter
- `tests/perf-subscription-checkout.test.ts` : B1, B2.
- `tests/sms-monthly-grant-plans.test.ts` : B3, B4, B5 (BDD pour la concurrence).
- `tests/commission-business.test.ts` : B6, B7, B8 (BDD pour le registre).
- `tests/perf-rights-server.test.ts` : B9 (BDD pour l'isolation A/B).

## Tests existants à modifier (modification explicitement approuvée dans le plan du lot)
- `tests/launch-lot1-hardened.test.ts` : `SAAS_ADMIN_CHECKOUT_PLANS`, `DESIRED_PLANS`, statut de Performance, texte d'essai, lien public `plan=BUSINESS`.
  **Conservés :** Équipe `coming_soon` sans lien ; « BUSINESS / ENTERPRISE restent mappés côté Billing ».
- `tests/pricing-source.test.ts` : « seuls Essentiel et Indépendant sont self_serve » devient « … et Performance ».

## Tests de non-régression (existants)
- `tests/billing-subscriptions.test.ts`, `tests/saas-billing-admin.test.ts`, `tests/refunds.test.ts`, `tests/billing-commercial-rules.test.ts`, `tests/platform-fee-ledger.test.ts`, `tests/customer-subscriptions-stripe.test.ts`, `tests/licensing-sms*.test.ts`, `tests/sms-*.test.ts`, `tests/billing-lifetime.test.ts`.
