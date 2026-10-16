# L14 — SEC-1 : sécurité Stripe Billing (CRITIQUE, prérequis bloquant de L15 et L16)

## Objectif
Aucun droit ne peut être accordé hors d'une liste blanche de Prices ; le portail client est maîtrisé par le code ;
aucun abonné historique n'est pénalisé.

## Dépendances
- Indépendant de L13. **Aucun autre lot Stripe, facturation ou paiements en parallèle** (L1, L3, L7, L8, L15, L16).
- Décisions de référence : `docs/lots/PERF-decisions.md` (N5, N6).

## Constat dans le code (16/10/2026, `main` @ c7c997d)
- Webhook `app/api/billing/webhook/route.ts` → `lib/billing/subscription-webhook.ts` : signature vérifiée en amont, idempotence via
  `billing_events` (marqué après succès), abonnement **relu chez Stripe** à chaque événement (ordre d'arrivée sans effet),
  Customer et `company_id` des métadonnées vérifiés, doublon annulé (`cancel_duplicate`).
- `buildSubscriptionStatePatch` (`lib/billing/subscription-core.ts`) résout le plan par `resolvePlanForStripePriceId` sur **tous** les plans
  payants configurés, `ENTERPRISE` compris (anomalie A2).
- `createSubscriptionPortalSession` (`lib/billing/subscription-portal.ts`) n'envoie **aucune `configuration`** : c'est la configuration par défaut
  du compte Stripe qui s'applique (anomalie A1). Le commentaire du fichier indique que les changements de formule ne passent pas par le portail.
- `handleInvoiceCreated` applique le coupon de fidélité à **toute** facture d'abonnement et exige le statut `draft`. Sinon : `INVOICE_NOT_DRAFT`,
  erreur réessayable (500). Stripe documente que les factures créées par un changement de formule ne restent pas en brouillon comme les
  renouvellements, et que les lignes de prorata ne sont pas remisables (`discountable=false`) → blocage probable B1.
- SDK `stripe` ^22.5 sans `apiVersion` explicite : les nouveaux abonnements créés par Checkout sont probablement en `billing_mode=flexible`
  (défaut depuis l'API 2025-09-30.clover). Les abonnements plus anciens peuvent être en `classic`. **À vérifier dans Stripe.**

## Décisions (tranchées)
- [x] P3 : changement de formule par le portail client Stripe, sécurisé par SEC-1 (Clément, 16/10).
- [x] Upgrade immédiat avec prorata ; downgrade en fin de période ; un seul abonnement Stripe actif par entreprise (Clément, 16/10).
- [x] Droits mis à jour uniquement par un événement Stripe validé et un Price autorisé (Clément, 16/10).
- [x] Équipe jamais activable ; aucun abonné historique privé de ses droits légitimes (Clément, 16/10).
- [x] Aucune suppression des remises de fidélité décidée à ce stade (Clément, 16/10).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] N5 : portail réglé sur « poursuivre l'essai » (`trial_update_behavior=continue_trial`) lors d'un upgrade pendant l'essai : oui / non
- [ ] N6 : traitement de la fidélité sur les factures de prorata (options O1 à O4 de PERF-decisions.md) : ____
  (**préalable : protocole de test N6 exécuté en mode test par le développeur, résultats notés**)
- [ ] Abonné historique dont le Price n'est plus achetable : conserver ses droits et alerter (proposé) : oui / non
- [ ] Nom de la variable de configuration du portail : `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` (proposé) : oui / autre ____

## Périmètre
- `lib/billing/config.ts` : liste blanche des plans achetables (`PRO`, `BUSINESS`), distincte des plans « connus ».
- `lib/billing/subscription-core.ts`, `lib/billing/subscription-webhook.ts` : refus de tout Price hors liste blanche (Équipe compris,
  même si sa variable est renseignée) ; règle des abonnés historiques ; traitement N6 des factures `billing_reason=subscription_update`.
- `lib/billing/subscription-portal.ts` : configuration explicite, vérifiée avant chaque session (active, produits limités aux 2 Prices,
  `always_invoice`, downgrade différé, comportement d'essai N5). Configuration non conforme → refus, jamais de portail par défaut.
- `.env.example` : **nom** de la nouvelle variable, valeur vide.
- **Hors périmètre (interdit) :** création ou modification d'objets Stripe, valeurs de variables, prix, coupons, barème de fidélité,
  `COMMISSION_RULES`, `PLAN_MATRIX`, migrations, abonnements existants, ouverture de la vente (→ L15).

## Critères d'acceptation
- [ ] S1 Price Performance → `BUSINESS` ; Price Indépendant → `PRO`.
- [ ] S2 Price Équipe → aucun droit, **même avec `STRIPE_PRICE_EQUIPE_MONTHLY` renseignée**.
- [ ] S3 Price inconnu → aucun droit, erreur journalisée, réponse 200 « rejected » (pas de boucle de renvois).
- [ ] S4 Signature invalide → refus, aucun effet.
- [ ] S5 Événement rejoué → aucun double effet.
- [ ] S6 Événements reçus dans le désordre → état final identique à l'état Stripe relu.
- [ ] S7 Second abonnement → `cancel_duplicate` ; second checkout → `ALREADY_SUBSCRIBED`.
- [ ] S8 Customer ou `company_id` incohérent → rejet, aucun changement de droits.
- [ ] S9 Portail sans configuration, configuration inactive, ou listant un autre Price → refus de créer la session.
- [ ] S10 Facture `subscription_update` d'un client avec palier de fidélité → comportement N6, **aucune erreur 500 en boucle**.
- [ ] S11 Abonné historique sur un Price connu mais non achetable → droits conservés, alerte journalisée.
- [ ] S12 Seul l'OWNER ouvre le portail ; le tenant B ne peut ni ouvrir ni modifier la facturation du tenant A ; aucun droit tiré d'un paramètre navigateur.

## Tests à ajouter
- `tests/billing-price-allowlist.test.ts` : S1, S2, S3, S11.
- `tests/billing-portal-config.test.ts` : S9, S12.
- `tests/billing-webhook-proration-invoice.test.ts` : S10 (factures `subscription_update`, palier 0 et palier > 0, statuts `draft` et `open`).
- Compléments dans les tests de webhook existants : S4 à S8.

## Tests de non-régression (existants)
- `tests/billing-subscriptions.test.ts`, `tests/saas-billing-admin.test.ts`, `tests/launch-lot1-hardened.test.ts`
  (« BUSINESS / ENTERPRISE restent mappés côté Billing » conservé), `tests/billing-commercial-rules.test.ts` (fidélité), `tests/billing-lifetime.test.ts`, `tests/lifetime-*.test.ts`.
