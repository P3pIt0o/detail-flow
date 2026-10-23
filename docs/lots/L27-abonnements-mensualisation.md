# L27 — Abonnements clients : nombre de prestations par an indépendant de l'échéancier (CRITIQUE)

## Objectif
Le pro définit séparément « combien de prestations sur une période » (ex. 6 par an) et « comment le client paie »
(ex. mensuel), pour proposer une mensualisation.

## Dépendances
Aucun autre lot `lib/customer-subscriptions/**` ou Stripe en parallèle (L14–L16, L1). Demande d'un tenant (21/10/2026) :
« je fais 6 prestations par an, ils paient tous les 2 mois ; j'aurais préféré une mensualisation ».

## Constat (`main` @ c7c997d, à revérifier)
- `maintenance_plans` : `billingIntervalUnit/Count` (week|month × N), `includedUsesPerCycle`, engagement
  (`commitmentUnit/Count`), `renewalMode`. Commentaire du schéma : **« V1 : un cycle de droits = une période de facturation »**.
- Donc aujourd'hui : 6 prestations/an ⇒ facturation tous les 2 mois (1 prestation par période). Impossible de payer
  mensuellement 6 prestations/an.
- Snapshots sur `maintenance_subscriptions` (`billingInterval*Snapshot`, `includedUsesPerCycleSnapshot`) ; cycles générés depuis
  `billingAnchorAt` ; commission abonnements clients appliquée à chaque facture (Stripe Connect).

## Décisions (tranchées)
- [x] Les abonnements existants gardent exactement leurs conditions (snapshots inchangés, aucune migration de données).
- [x] Aucun changement de la commission DetailFlow ni des droits par offre.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Modèle : « N prestations par période de droits » (ex. 6 / 12 mois) + échéancier (mensuel, …) — proposé : oui / autre ____
- [ ] Prix mensuel = prix annuel / 12, arrondi au centime : arrondi sur la 1re ou la dernière échéance ? ____
- [ ] Engagement obligatoire quand les droits sont annuels et le paiement mensuel (ex. 12 mois) pour éviter qu'un client
  consomme puis résilie : oui (proposé) / non ____
- [ ] Une prestation peut-elle être consommée avant d'être « payée » au prorata (ex. 2 prestations dès le 1er mois) ? ____
- [ ] Prestations non utilisées en fin de période : perdues / reportées ____
- [ ] Résiliation anticipée sous engagement : règle existante conservée (proposé) : oui / non

## Périmètre
- Migration **additive** (`scripts/<nom>-migration.sql`, `IF NOT EXISTS`, exécutée par le développeur) : période de droits
  sur `maintenance_plans` et snapshot sur `maintenance_subscriptions` ; valeur par défaut = comportement V1 (droits = facturation).
- Calcul des droits par période, échéancier, affichage pro (création d'offre) et client (récapitulatif contractuel, espace client).
- Hors périmètre : prix des offres DetailFlow, commission, abonnements existants, nouveaux moyens de paiement.

## Critères d'acceptation
- [ ] Offre « 6 prestations / 12 mois, paiement mensuel » : 12 échéances, 6 droits sur la période, total = prix annuel au centime.
- [ ] Offres existantes et abonnements en cours : comportement strictement identique (tests V1 inchangés).
- [ ] Consommation au-delà des droits refusée côté serveur ; règle de consommation anticipée conforme à la décision.
- [ ] Commission appliquée à chaque échéance comme aujourd'hui (0 % / 3 % / 7 % selon l'offre).
- [ ] Test A/B multi-tenant sur création d'offre, souscription et consommation.
- [ ] Webhooks Stripe Connect rejoués : idempotents.

## Tests à ajouter
- `tests/customer-subscriptions-rights-period.test.ts` (calcul, arrondis, droits, engagement) ; tests BDD pour la migration et l'isolation.

## Tests de non-régression (existants)
- Tous les `tests/customer-subscriptions-*.test.ts` (baseline).
