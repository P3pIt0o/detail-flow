# L0 — Grille tarifaire (décisions commerciales, sans code)

**Nature : décisions humaines uniquement. Aucun code, aucune donnée Neon, aucun objet Stripe modifié par ce lot.**

## Décisions confirmées (16/10/2026, par toi)
- [x] **Le projet de simplification à deux offres est abandonné définitivement.** Aucun lot ne doit le reprendre.
- [x] **Quatre offres publiques conservées**, identiques au code actuel (`lib/pricing/plans.ts`) :

  | Offre publique | Plan technique | Prix mensuel |
  |---|---|---|
  | Essentiel | `FREE` | gratuit |
  | Indépendant | `PRO` | 19,90 € / mois |
  | Performance | `BUSINESS` | 34,90 € / mois |
  | Équipe | `ENTERPRISE` | 59,90 € / mois |

- [x] **Barème de fidélité conservé** : 5 % à 6 mois, 10 % à 12 mois, 15 % à 18 mois, 17,5 % à 24 mois, 20 % à partir de 30 mois
  (identique à `LOYALTY_DISCOUNT_TIERS` dans `lib/billing/commercial-rules.ts`).
- [x] **Plans techniques historiques préservés** : `ESSENTIAL`, `FOUNDER` (et Lifetime) restent dans le code ; aucun abonnement
  existant n'est modifié, migré ou résilié.
- [x] **Aucune migration tarifaire** : les prix confirmés sont ceux déjà en vigueur dans le code, il n'y a donc pas de bascule d'abonnés à préparer.

## Constat dans le code (16/10/2026, `main` @ c7c997d)
| Élément | Valeur actuelle | Où |
|---|---|---|
| Plans techniques | `FREE`, `ESSENTIAL`, `PRO`, `BUSINESS`, `ENTERPRISE`, `FOUNDER` | `lib/licensing/types.ts` |
| Vente libre (`self_serve`) | Essentiel, Indépendant | `lib/pricing/plans.ts` |
| « Bientôt » (`coming_soon`) | Performance, Équipe | `lib/pricing/plans.ts` |
| HT / TTC des abonnements | « Prix indiqués hors taxes » affiché ; aucune TVA appliquée par Stripe Billing (montant prélevé = montant affiché) | `lib/pricing/plans.ts`, `scripts/setup-stripe-billing-products.ts` |
| Essai | 30 jours sans carte, Indépendant uniquement | `PRICING_COPY.trialHeadline` |
| Commissions paiements en ligne | FREE 2 % plafond 19,90 € · PRO 1 % plafond 5 € · BUSINESS 0,5 % plafond 5 € · ENTERPRISE 0,25 % plafond 6 € · Lifetime 0 % · `ESSENTIAL`/`FOUNDER`/inconnu : taux de repli **sans plafond** ; surcharge super-admin possible | `lib/billing/commercial-rules.ts` |
| Commissions abonnements d'entretien | système séparé | `lib/customer-subscriptions/plan-policy.ts` |
| SMS inclus / mois | FREE 0, PRO 20, autres plans : rien | `lib/sms/config.ts` |
| Lifetime | 1 290 € HT ou 2 × 690 € HT, 50 licences max | `lib/pricing/plans.ts` |
| Prix annuels | aucun | — |
| Promotion de lancement | aucune dans le code | — |

## Décisions encore manquantes — BLOQUANT — VALIDATION HUMAINE
Aucune de ces valeurs ne sera choisie par un agent. Les valeurs actuelles du code restent en vigueur tant que tu ne tranches pas.

| # | Décision | Valeur actuelle | Bloque |
|---|---|---|---|
| D1 | Régime de TVA et affichage HT/TTC (options D1-A, D1-B, D1-C dans `PERF-decisions.md` §5) | « hors taxes » affiché, aucune TVA côté Stripe | L3, L4, GO Performance |
| D2 | Ouverture à la vente de Performance et Équipe (date ou condition) | « bientôt » | L4, L6 |
| D3 | Commission Équipe (`ENTERPRISE`) : 0 % comme évoqué en octobre, ou valeur actuelle 0,25 % plafond 6 € | 0,25 % / 6 € | L1 |
| D4 | Commissions Essentiel / Indépendant / Performance : conserver 2 % / 1 % / 0,5 % et leurs plafonds | valeurs actuelles | L1 |
| D5 | Commission des plans historiques `ESSENTIAL` / `FOUNDER` (aujourd'hui repli **sans plafond**) | repli sans plafond | L1 |
| D6 | Commission des abonnements d'entretien : grille séparée conservée ou alignée | séparée | L1 |
| D7 | SMS inclus par mois : **Performance = 50 (décidé le 16/10, P1 → L15)** ; Équipe, Lifetime/Founder, cumul ou plafond encore ouverts | rien | L2, L15 |
| D8 | Facturation annuelle : oui/non, prix annuels par offre, plans concernés | aucune | L3 |
| D9 | Promotion de lancement : oui/non ; si oui montant, durée, éligibilité | aucune | L3, L4, L7 |
| D10 | Cumuls fidélité × annuel × promotion | non défini | L3, L7 |
| D11 | Essai 30 jours : **étendu à Performance, une fois par entreprise tous plans confondus (décidé le 16/10, P2 → L15)** | Indépendant | L15 |
| D12 | Lifetime : offre maintenue telle quelle (prix, 50 licences) | maintenue | L4, L12 |

## Inventaire des dépendances (constaté)
- Code : `lib/pricing/plans.ts`, `lib/licensing/registry.ts`, `lib/licensing/types.ts`, `lib/billing/commercial-rules.ts`,
  `lib/billing/subscription-*.ts`, `lib/billing/config.ts`, `lib/customer-subscriptions/plan-policy.ts`, `lib/sms/config.ts`,
  `components/marketing/v4/pricing-data.ts`, `components/marketing/v4/pricing.tsx`, `components/marketing/v4/faq-data.ts`, `.env.example`.
- Tests : `tests/pricing-source.test.ts`, `tests/pricing-plan-details.test.ts`, `tests/home-plans-order.test.ts`,
  `tests/billing-commercial-rules.test.ts`, `tests/billing-subscriptions.test.ts`, `tests/billing-config.test.ts`,
  `tests/licensing-enterprise.test.ts`, `tests/licensing-resolver.test.ts`, `tests/customer-subscriptions-plan-policy.test.ts`.

## Risque
Aucun code dans L0. Les lots qui appliqueront D1 à D12 (L1, L2, L3, L4, L7) sont CRITIQUES ou dépendent de lots critiques.
