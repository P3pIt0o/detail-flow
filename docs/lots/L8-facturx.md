# L8 — Facturation et Factur-X (CRITIQUE ; audit d'abord)

## Objectif
Raccorder Factur-X (PDF/A-3b + XML EN16931) aux factures réelles de façon sûre : éligibilité vérifiée, données légales
jamais inventées, repli PDF explicite, activation progressive.

## Dépendances
Aucune décision tarifaire. Ne pas coder en même temps qu'un autre lot Stripe/facturation (L1, L3, L7).

## Constat (16/10/2026)
- **`main` ne contient pas Factur-X** : `lib/invoice/` = `actions.ts`, `calc.ts`, `credit.ts`, `logo.ts`, `pdf.tsx`, `queries.ts`,
  `tax-treatment.ts` ; tests `tests/invoice-credit.test.ts`, `tests/invoice-currency-render.test.ts`.
- Le chantier est dans des **branches non fusionnées** :
  `feat/facturx-xml-v2` (10/10), `feat/facturx-pdfa3` (10/10), `feat/facturx-generator-c1` (10/10), `feat/facturx-invoice-c2` (10/10),
  `feat/facturx-hardening-c3` (10/10, « trois designs »), **`feat/facturx-integration-c4` (13/10, la plus avancée)**.
- `feat/facturx-integration-c4` contient : `lib/invoice/facturx/{xml,types,codes}.ts`, `facturx-adapter.ts`, `facturx-eligibility.ts`,
  `facturx-invoice.ts`, `facturx-pdfa.ts`, `facturx-presentation.ts`, `facturx-rollout.ts`, `facturx-visual*.tsx`, `template-policy.ts`,
  polices et profil ICC dans `public/facturx-assets/`, dépendances `@stafyniaksacha/facturx@0.6.1` et `pdf-lib@1.17.1`, et 8 fichiers de tests `tests/facturx-*.test.ts`.
- Activation pilotée par `FACTURX_INVOICES_ENABLED=true` + `FACTURX_PILOT_COMPANY_IDS` (`facturx-rollout.ts`).
- Codes d'inéligibilité : `MISSING_FIELD`, `INVALID_FIELD`, `UNKNOWN_LEGAL_SCHEME`, `TAX_TREATMENT_MISSING`, `TAX_DATA_CONFLICT`,
  `AMOUNT_MISMATCH`, `MISSING_PAYMENT_DUE_DATE`, `CREDIT_NOTE_SETTLEMENT_UNDECIDED`, `ORIGINAL_INVOICE_REFERENCE_MISSING`…
  (`lib/invoice/facturx/types.ts` de la branche c4). Le fallback `INELIGIBLE / MISSING_FIELD` des cas de test est à diagnostiquer à partir de ces codes et du champ `field` de chaque erreur.
- Décision que tu as prise le 11/10 : **un seul modèle de facture** (Business Pro, bleu et blanc), sans sélecteur, droits logo par
  formule conservés. À vérifier contre `feat/facturx-hardening-c3` (« trois designs ») et `template-policy.ts`.
- La base de la branche c4 par rapport à `main` n'a pas été vérifiée (clone superficiel) : à faire en début d'audit.

## Règle confirmée (16/10/2026)
- [x] **Aucune branche `feat/facturx-*` n'est fusionnée sans audit (`/audit L8`) puis ta validation explicite.** Ces branches sont
  protégées dans le kit : les agents peuvent les lire, jamais y écrire.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Branche de référence à reprendre (c4 ?) et branches à abandonner : ____
- [ ] Avoirs : mapping du règlement (BT-115) pour `CREDIT_NOTE_SETTLEMENT_UNDECIDED` : ____
- [ ] Clients particuliers / professionnels / étrangers : champs exigés par type (SIRET, TVA intracom., pays) — **aucune règle fiscale choisie par l'agent** : ____
- [ ] Profil Factur-X visé (MINIMUM, BASIC, EN16931…) : ____
- [ ] Ordre d'activation (pilotes nommés hors dépôt, puis généralisation) : ____

## Périmètre
Audit en lecture seule d'abord (rapport), puis intégration de la branche retenue dans `lib/invoice/**`, `app/api/factures/**`,
`app/admin/(dashboard)/factures/**`, tests `tests/facturx-*`.
Hors périmètre : règles fiscales nouvelles, données légales manquantes (jamais fabriquées), envoi à une plateforme de dématérialisation.

## Critères d'acceptation
- [ ] Rapport : pour chaque cas de test inéligible, la liste exacte des champs manquants (`field`) et leur source attendue.
- [ ] Aucune donnée légale, SIRET, TVA ou info client fabriquée ou valeur par défaut silencieuse.
- [ ] Factur-X désactivé par défaut ; inéligible ⇒ PDF classique explicite, jamais un Factur-X invalide.
- [ ] Montants HT/TVA/TTC du XML = ceux de la facture (`AMOUNT_MISMATCH` testé) ; avoirs référencent la facture d'origine.
- [ ] Une facture d'un tenant n'est jamais générable/téléchargeable par un autre (test A/B sur `app/api/factures/[id]/pdf`).
- [ ] Validation PDF/A-3 et XML par un outil externe sur Preview, documentée (outil et version), faite par toi.

## Tests de non-régression (existants sur `main`)
`tests/invoice-credit.test.ts`, `tests/invoice-currency-render.test.ts`, `tests/seller-billing-profile.test.ts`,
`tests/billing-country-profiles.test.ts` + les `tests/facturx-*.test.ts` de la branche retenue.
