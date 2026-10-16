# L16 — PERF-1c : changement de formule Indépendant ↔ Performance (CRITIQUE)

## Objectif
Permettre l'upgrade immédiat avec prorata et le downgrade en fin de période via le portail Stripe, en conservant ancienneté,
fidélité, historique d'essai et données (prospects en lecture seule après downgrade).

## Dépendances
- **L14 et L15 fusionnés par le développeur.** Configuration du portail **en mode test** créée par le développeur.
- Protocole de test N6 exécuté et décision N6 prise (PERF-decisions.md).
- Ne pas mener en parallèle de L2, L7 ou L8.

## Constat dans le code (16/10/2026, `main` @ c7c997d)
- Aucun chemin de changement de formule : `ALREADY_SUBSCRIBED` bloque tout second checkout ; portail sans configuration (corrigé par L14).
- `buildSubscriptionStatePatch` : un changement de Price est un simple changement de plan ; `continuousSubscriptionStartedAt`
  et `subscriptionStartedAt` ne sont pas touchés. Résiliation programmée détectée via `cancel_at_period_end` **ou** `cancel_at`
  (le portail en `billing_mode=flexible` utilise `cancel_at`).
- Prospects : sans `leads_crm`, `app/admin/(dashboard)/leads/page.tsx` affiche `LeadsLocked` et masque toutes les données ;
  les 6 actions de `leads/actions.ts` passent par `guard()` (refus serveur) ; la synchronisation depuis les réservations
  (`lib/booking/cancel.ts`, `lib/payments/queries.ts`, `app/admin/(dashboard)/actions.ts`) s'arrête déjà. **Aucun mode lecture seule.**
- Dépenses : droit `expense_management` d'Indépendant → aucune restriction après un downgrade.
- SMS : crédit idempotent par mois (`monthlyGrantKey`) ; aucune mémoire du montant déjà crédité dans le mois
  (`monthlyGrantedTotal` est un cumul toutes périodes).

## Décisions (tranchées)
- [x] P3 : portail Stripe ; upgrade immédiat avec prorata ; downgrade à la fin de la période déjà payée ; un seul abonnement actif (Clément, 16/10).
- [x] P4 : prospects conservés en lecture seule après downgrade ; aucune création, modification ou suppression ; aucun effacement automatique (Clément, 16/10).
- [x] Fidélité : barème inchangé, ancienneté continue conservée, aucun nouveau compteur, aucun cumul de coupons (Clément, 16/10).
- [x] Le changement de formule ne réinitialise jamais l'ancienneté ni l'historique d'essai (Clément, 16/10).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] N4 : complément de SMS lors d'un upgrade en cours de mois (variantes N4-A, N4-B, N4-C de PERF-decisions.md) : ____
- [ ] N4 (si complément) : migration additive `sms_credits."monthlyGrantedForKey"` acceptée (exécutée par le développeur, jamais par l'agent) : oui / non
- [ ] N6 : résultat du protocole de test et option retenue (rappel de la décision prise dans L14) : ____
- [ ] Lecture seule des prospects : export CSV autorisé en lecture seule s'il existe déjà : oui / non
- [ ] Texte du bandeau de lecture seule et de l'affichage « Passage à Indépendant le … » : ____

## Périmètre
- `app/admin/(dashboard)/abonnement/page.tsx` : bouton « Changer de formule » (OWNER) vers le portail ; affichage du downgrade programmé.
- `lib/leads/access.ts` (nouveau) : état `full | read_only | locked`, calculé côté serveur (`read_only` = droit absent **et** prospects existants).
- `app/admin/(dashboard)/leads/page.tsx`, `leads/[id]/page.tsx`, `leads/actions.ts`, `components/admin/leads/*` : affichage en lecture seule ;
  toutes les écritures restent refusées par `guard()`.
- `lib/billing/subscription-portal.ts` : commentaire et flux mis à jour.
- Selon N4 : `lib/sms/credits.ts` (+ `scripts/<nom>-migration.sql` additif et idempotent, **non exécuté**).
- **Hors périmètre (interdit) :** barème et coupons de fidélité, `loyalty-coupons.ts`, `PLAN_MATRIX`, prix, commissions, objets Stripe,
  suppression de données, abonnements existants.

## Critères d'acceptation
- [ ] C1 (manuel, mode test) upgrade → facture de prorata immédiate payée ; `BUSINESS` dès l'événement validé ; **aucune erreur 500 du webhook**.
- [ ] C2 (manuel, horloge de test) downgrade → programmé ; `BUSINESS` jusqu'à la fin de période ; `PRO` ensuite.
- [ ] C3 Un seul abonnement Stripe actif à tout moment ; aucun checkout possible pendant un abonnement actif.
- [ ] C4 `continuousSubscriptionStartedAt` et `subscriptionStartedAt` identiques avant et après upgrade et downgrade.
- [ ] C5 Renouvellement suivant : coupon du palier appliqué une seule fois ; jamais deux coupons.
- [ ] C6 Upgrade pendant l'essai → comportement N5 ; aucun nouvel essai.
- [ ] C7 Paiement refusé du prorata → `past_due` (accès conservé selon la règle existante), puis comportement existant si `unpaid`.
- [ ] C8 Après downgrade : prospects visibles en lecture ; les 6 actions refusées côté serveur ; aucune ligne supprimée ; tenant B sans accès aux prospects de A.
- [ ] C9 SMS selon N4 ; solde jamais repris ; aucun double crédit (voir tests N4).
- [ ] C10 Commission : les paiements créés après la transition utilisent le taux du nouveau plan ; ceux réservés avant gardent leur taux.

## Tests à ajouter
- `tests/leads-read-only.test.ts` : C8 (BDD pour l'isolation A/B).
- `tests/billing-plan-change.test.ts` : C3, C4, C6, C7, C10 (événements simulés).
- `tests/sms-upgrade-complement.test.ts` : C9 et la liste de tests N4 de PERF-decisions.md (BDD pour la concurrence).
- Recette manuelle C1, C2, C5 : PERF-decisions.md (protocole N6) et plan v2 §8.4.

## Tests de non-régression (existants)
- `tests/leads-crm.test.ts`, `tests/leads-tenant-link.test.ts`, `tests/leads-list-date.test.ts`, `tests/leads-schema-tolerance.test.ts`, `tests/billing-subscriptions.test.ts`, `tests/billing-commercial-rules.test.ts`, `tests/licensing-sms*.test.ts`, `tests/sms-*.test.ts`.
