# L29 — Commission 0 % sur les offres payantes (CRITIQUE)

Lot séparé de L13 (L13 reste un lot d'affichage). À lancer **après la fusion de L13**, sur une branche partie de `main`.
Risque : CRITIQUE (montants réellement prélevés par DetailFlow via Stripe Connect).

## Décisions (tranchées)

- [x] **C1 (Clément, 25/10/2026)** : la commission DetailFlow ne s'applique plus qu'à l'offre gratuite **Essentiel (FREE)**, inchangée :
  paiements en ligne 2 % plafonnés à 19,90 €/mois ; abonnements clients 7 %.
  **Indépendant (PRO), Performance (BUSINESS), Équipe (ENTERPRISE) : 0 % sur les paiements en ligne et 0 % sur les abonnements clients.**
  Lifetime, FOUNDER et LEGACY (`plan === null`) : 0 % (inchangé). `ESSENTIAL` (abonnements clients 700 bps) : inchangé.
- [x] Motif : argument d'upgrade. Seule une baisse : aucun client n'est désavantagé.
- [x] **Non-rétroactivité** : s'applique aux paiements et factures **créés après le déploiement**. Aucune ligne existante du registre
  (`platform_fee_ledger`) recalculée ; aucun remboursement de commission passée ; aucune modification des objets Stripe existants
  (PaymentIntents, abonnements) par l'agent.
- [x] Les frais Stripe restent à la charge du pro et sont mentionnés comme « frais Stripe distincts » là où ils l'étaient déjà.
- [x] Textes : partout où une commission PRO / BUSINESS / ENTERPRISE est affichée (cartes d'offres, comparateur, FAQ « commission »,
  admin › Mon abonnement, page Abonnements clients, volet), afficher « 0 % de commission ». Points forts d'Indépendant : les lignes de
  commission deviennent une seule ligne « 0 % de commission sur vos paiements et abonnements ». Performance : « Abonnements clients
  illimités, 0 % de commission » et « 0 % de commission sur vos paiements en ligne ». Essentiel : textes actuels conservés.

## À établir pendant l'AUDIT (sans rien décider)

- Abonnements clients **déjà actifs** d'un tenant PRO : la commission est-elle recalculée à chaque facture (webhook / `feeBpsForCharged`)
  ou figée sur l'objet Stripe (`application_fee_percent`) ? Si le passage à 0 % des abonnements existants exige de modifier des objets
  Stripe existants → **BLOQUANT — VALIDATION HUMAINE** (procédure manuelle pour le développeur), ne rien écrire côté Stripe.
- Paiement réservé (`reservedCents`) avant le déploiement et capturé après : garde son taux réservé (le registre fait foi).

## Périmètre

- `lib/billing/commercial-rules.ts` : `COMMISSION_RULES` PRO, BUSINESS, ENTERPRISE → `{ feeBps: 0, monthlyFeeCapCents: 0 }` ; FREE inchangé.
- `lib/customer-subscriptions/plan-policy.ts` : `CUSTOMER_SUBSCRIPTION_PLATFORM_FEE_BPS.PRO` → 0 (BUSINESS, ENTERPRISE déjà 0 ; FREE, ESSENTIAL inchangés).
- Sources de textes de commission : `lib/pricing/plans.ts`, `components/marketing/v4/pricing-data.ts`, `faq-data.ts`, admin › abonnement,
  abonnements clients (affichage).
- Tests (ci-dessous) + mise à jour **explicitement approuvée** des tests existants : `tests/billing-commercial-rules.test.ts`,
  `tests/platform-fee-ledger.test.ts`, `tests/customer-subscriptions-plan-policy.test.ts`, `tests/commercial-funnel.test.ts` si concerné.
- **Hors périmètre (interdit)** : prix, `PLAN_MATRIX`, essais, SMS, FREE, Lifetime, migrations, objets Stripe existants, TVA.
- Aucune migration, aucune variable d'environnement.

## Critères d'acceptation

- [ ] A9 Paiement en ligne : PRO / BUSINESS / ENTERPRISE → frais 0, `application_fee_amount` **absent** (déjà le cas si 0, `providers.ts`) ;
  FREE : 2 % au centime, plafond 19,90 € atteint puis dépassé, inchangé ; Lifetime 0 % inchangé ; tenant A FREE et tenant B PRO sans effet croisé.
- [ ] A10 Abonnement client : nouvelle souscription chez un PRO / BUSINESS → aucun `application_fee_percent` / `application_fee_amount` ;
  FREE 7 % inchangé ; LEGACY `null` 0 % inchangé (ne jamais assimiler à FREE).
- [ ] A11 Non-rétroactivité : une réservation de commission existante (registre) garde son `feeBps` ; aucune requête de mise à jour sur les lignes existantes.
- [ ] A12 Downgrade PRO → FREE après déploiement : les paiements créés ensuite reprennent 2 % ; ceux créés avant gardent 0 %.
- [ ] A13 Aucun texte public ou admin n'affiche une commission non nulle pour PRO / BUSINESS / ENTERPRISE (test de rendu + recherche dans les sources de textes) ; textes FREE inchangés.
- [ ] A14 Le compte des tests en échec et des erreurs TypeScript n'augmente pas par rapport à la baseline.

## Aperçu : sans objet — changements visibles limités aux textes de commission, déjà validés sur l'aperçu L13 (version 4, 25/10/2026).
