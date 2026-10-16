# Index des lots — dépendances, conflits et ordre d'exécution

Constat : 16/10/2026, `main` @ c7c997d. **Décisions du 16/10 : 4 offres publiques conservées (Essentiel gratuit, Indépendant
19,90 €, Performance 34,90 €, Équipe 59,90 €), simplification à deux offres abandonnée définitivement, barème de fidélité
conservé, plans historiques et abonnements existants préservés.**
Dernier merge sur `main` : 08/10 (PR #259). 44 branches distantes, dont plusieurs non fusionnées
qui touchent des lots (signalées ci-dessous). **Aucun lot n'est commencé. Une seule branche d'implémentation active à la fois.**

## Tableau des lots

| Id | Lot | Risque | Dépend de | Bloqué par une décision ? | Peut démarrer |
|----|-----|--------|-----------|---------------------------|---------------|
| P0 | Préparation, installation, baseline (`P0-preparation.md`) | — | — | non | **maintenant** |
| L99 | Pilote : README obsolète | faible | P0 | non | **après P0** (premier `/lot`) |
| L98 | CI sur PR | critique (`.github/`) | P0 | oui (lint, build, base de test) | après tes décisions |
| L0 | Grille tarifaire (décisions, sans code) | — | — | oui, D1 à D12 (grille de base **confirmée**) | **maintenant (toi)** |
| L1 | Commissions par plan | critique | L0 (D3–D6) | oui | après D3–D6 |
| L2 | SMS inclus | critique | L0 (D7) | oui (quotas) | après D7 |
| L3 | Facturation annuelle | critique | L0 (D1, D8–D10), cohabitation L7 | oui (prix annuels, cumuls) | après D8 et L1 |
| L4 | Landing, tarifs, FAQ | faible/moyen | L0, L1, L2, L3 (+L7 si affiché) mergés | oui (contenus) | en dernier des lots tarifaires |
| L5 | Import clients | moyen (critique si migration) | — | oui (formats, doublons, plans) | dès tes décisions |
| L6 | Liste d'attente | à définir | — | **oui (nature a/b)** | dès ta décision |
| L7 | Fidélité (**déjà implémentée**, barème reconfirmé : audit d'abord, pas de recréation) | critique | L0 (D9, D10), L3 | oui (impayés, fuseau, cumuls) | `/audit L7` maintenant |
| L8 | Factur-X (**branches non fusionnées, aucune fusion sans audit et validation**) | critique | aucun lot Stripe/facturation en parallèle | oui (branche de référence, avoirs, règles fiscales) | `/audit L8` maintenant |
| L9 | Réservations, widgets | moyen / critique si acomptes | — | oui (anomalies à traiter) | audit lecture seule maintenant |
| L10 | SEO tenants sans domaine | moyen | — | oui (éligibilité) | audit lecture seule maintenant |
| L11 | Sites personnalisés et admin | moyen / critique | `feat/cleanyzer-v3-integration` **préservée intégralement** | oui (anomalies, branches) | `/audit L11` maintenant |
| L12 | Préparation commerciale | transverse | L0–L8 terminés ou reportés | oui (monitoring, sauvegardes) | en dernier |
| L13 | PERF-1a : affichage commercial de Performance (reste non achetable) | critique (`lib/pricing/**`) | P0 | oui (N1, N7, 2 points d'affichage) | **après ton autorisation** |
| L14 | SEC-1 : sécurité Stripe Billing (liste blanche, portail, fidélité × prorata) | critique | aucun lot Stripe en parallèle | oui (N5, N6 après test) | après ton autorisation |
| L15 | PERF-1b : souscription Performance, essai, 50 SMS | critique | L13 + L14 fusionnés, Price test vérifié | oui (N2, N3, N8, textes d'essai) | après L14 |
| L16 | PERF-1c : changement de formule (portail), prospects en lecture seule | critique | L15 fusionné, portail test créé | oui (N4, N6) | après L15 |

Décisions et études PERF-1 (N1–N9, N3, N4, N6, D1) : `PERF-decisions.md`.

« Audit lecture seule » = `/lot <id>` jusqu'au plan (la garde interdit toute écriture hors plan), sans approbation d'implémentation.

## Conflits et écarts entre la feuille de route et le dépôt

| # | Sujet | Feuille de route | Réalité du dépôt | Conséquence |
|---|-------|------------------|------------------|-------------|
| 1 | Grille tarifaire | **Résolu le 16/10** : 4 offres conservées aux prix du code | 6 plans techniques (dont `ESSENTIAL`, `FOUNDER`, préservés) ; Performance et Équipe encore « bientôt » ; commissions 2/1/0,5/0,25 % | Restent D1 à D12 de L0 (HT/TTC, ouverture des ventes, commissions, SMS, annuel, promotion, cumuls) |
| 2 | L7 « nouveau » | Fidélité à créer | **Déjà implémentée** sur `main` (barème identique, coupons Stripe, webhook, ancienneté) | L7 devient un audit + comblement d'écarts ; aucune implémentation parallèle |
| 3 | Ancienneté fidélité | Tester le fuseau | Calcul en **UTC** | Décision humaine : UTC ou fuseau du tenant |
| 4 | Factur-X | Reprendre « l'état réel » | **Rien sur `main`** ; 6 branches `feat/facturx-*` non fusionnées, la plus avancée `feat/facturx-integration-c4` (13/10) | Choisir la branche de référence avant tout code |
| 5 | Modèle de facture | — | Ta décision du 11/10 : un seul modèle ; une branche contient « trois designs » | À vérifier pendant l'audit L8 |
| 6 | Plans historiques | — | `ESSENTIAL`/`FOUNDER` → commission de repli **sans plafond** | Décision dans L0/L1 |
| 7 | L11 JustClean | Site personnalisé à vérifier | **Pas de site personnalisé JustClean** dans le code (seulement cleanyzer, rozan, spirit-acs) | Préciser ce qu'il faut auditer pour JustClean |
| 8 | L10 « sans domaine » | Tenants sans domaine propre | Aucun domaine personnalisé n'existe encore (champ prévu, pas de colonne) : tous les tenants sont concernés | Règle d'éligibilité à décider |
| 9 | CI (Phase 0) | Lint, types, tests, build | **Aucune CI** ; `pnpm lint` inutilisable (ESLint absent) | Lot L98 avec décisions |
| 10 | Suivi d'erreurs (L12) | Métriques et alertes | Aucun outil installé | Décision d'outil |
| 11 | Branches actives | Une branche d'implémentation à la fois | `feat/cleanyzer-v3-integration` (15/10) non fusionnée | **Préservée intégralement** (protégée dans le kit) ; pas de lot L9/L11 en écriture touchant Cleanyzer avant ta décision |

## Ordre d'exécution proposé

**Commercialisation de Performance (validé le 16/10/2026) :** L13 → L14 → L15 → L16 → recette → GO / NO-GO (fusion et
déploiement uniquement par toi). L13 et L14 sont indépendants mais ne tournent jamais en même temps (une branche active à la fois).
L1 ne bloque plus Performance (P10 confirme les règles existantes) ; L2 démarre après L15 (`lib/sms/**` commun).


1. **Toi, maintenant :** P0 (installation, `doctor`, tests du kit, baseline), puis trancher les décisions **D1 à D12 de L0** (la grille de base est déjà confirmée).
2. **Premier `/lot` : L99** (pilote documentaire, risque faible) pour valider le cycle complet.
3. **Audits en lecture seule** avec `/audit` (aucune approbation d'implémentation) : L7 (fidélité existante), L8 (branches Factur-X), L11, L9 — constats et questions, sans code.
4. **Implémentation, une branche à la fois, uniquement après ton accord explicite pour chaque lot** :
   L1 → L2 → L3 → L7 (écarts) → L4, puis L8 (aucun autre lot Stripe/facturation en parallèle), L5, L6, L9, L10, L11, L98.
5. **L12** pour décider de la généralisation commerciale.

## Règles communes (rappel)
- Toute modification de paiements, commissions, abonnements, permissions, isolation multi-tenant, factures ou migrations est **CRITIQUE**
  (le kit le calcule à partir des chemins, voir `.claude/hooks/policy.json`).
- Aucune décision commerciale, fiscale ou d'accès n'est prise par l'agent : `BLOQUANT — VALIDATION HUMAINE`.
- Un test BDD **ignoré** n'est jamais présenté comme **réussi** ; les contrôles automatiques ne prouvent pas l'absence de faille.
