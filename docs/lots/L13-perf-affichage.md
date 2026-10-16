# L13 — PERF-1a : affichage commercial de Performance (CRITIQUE)

## Objectif
Présenter Performance honnêtement : fonctions réelles affichées normalement, fonctions futures grisées « Bientôt disponible ».
**Performance reste non achetable à l'issue de ce lot.**

## Dépendances
- Aucune dépendance technique. Kit installé (P0) et pilote L99 terminés recommandés avant le premier lot critique.
- Ne pas mener en parallèle de L14, L15, L16, L1, L2 ou L4 (fichiers `lib/pricing/**` et `components/marketing/v4/**` communs).
- Décisions de référence : `docs/lots/PERF-decisions.md`.

## Constat dans le code (16/10/2026, `main` @ c7c997d)
- `lib/pricing/plans.ts` : Performance (`ultime`, plan `BUSINESS`) est `coming_soon`, CTA sans lien. Ses `highlights` promettent
  « Automatisations, SMS & relances » et « Leads / CRM & marketing avancé ». `includedFeatures` contient `automations` et `marketing`.
- Les clés `automations` et `marketing` existent dans `PLAN_MATRIX.BUSINESS`, mais **aucun `canUseFeature`** ne les utilise : aucun module livré.
- `components/marketing/v4/pricing-data.ts` : « Campagnes & relances clients » et « Domaine personnalisé » sont `ultimeUp`
  (cochées pour Performance **et** Équipe) alors qu'elles ne sont pas construites. « Chiffre d'affaires & panier moyen » est `ultimeUp`
  alors que ces indicateurs dépendent de `business_stats`, accordé à PRO (`lib/analytics/access.ts`).
- `PLAN_MATRIX.PRO` accorde déjà `expense_management` et `profitability_analysis`.
- `components/marketing/v4/pricing.tsx` : `PlanFeatureDetails` affiche « Fonctionnalités prévues » ou « Fonctionnalités incluses », avec
  une coche sur chaque élément. Comparateurs `FeatureCompare` (ordinateur) et `MobileFeatureCompare`.
- `components/marketing/v4/faq-data.ts` l. 40 : « Performance et Équipe seront bientôt disponibles ».

## Décisions (tranchées)
- [x] 4 offres conservées, Équipe « Bientôt disponible » (Clément, 16/10/2026).
- [x] P5 : 4 fonctions « Prochainement » : Automatisations avancées, Marketing avancé, Campagnes et relances clients, Domaine personnalisé (Clément, 16/10).
- [x] P6 : libellés exacts ci-dessus, sur toutes les surfaces (Clément, 16/10).
- [x] P7 : description « Développez votre activité avec une gestion avancée de vos clients, de vos prospects et de votre rentabilité. » (Clément, 16/10).
- [x] P8 : icône horloge, aucune coche verte, aucune date, texte grisé lisible, contraste clair et sombre, 360 px, clavier, lecteurs d'écran (Clément, 16/10).
- [x] P9 : corriger l'affichage pour refléter les droits existants, sans toucher à `PLAN_MATRIX` (Clément, 16/10).
- [x] P11 : texte exact « Ces fonctionnalités sont en préparation. Elles ne sont pas incluses actuellement dans l'offre Performance. Leur disponibilité sera annoncée ultérieurement. » (Clément, 16/10).
- [x] P12 : projet de CGV préparé, **publication uniquement après relecture et validation humaine** (Clément, 16/10).
- [x] Découpage L13 à L16 validé (Clément, 16/10).

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] N1 : liste définitive des points forts de Performance. P7 cite « Suivi des dépenses » et « Analyse de rentabilité », déjà inclus dans Indépendant (voir PERF-decisions.md) : ____
- [ ] N7 : ajouter une ligne « Analyse de rentabilité » au comparateur (Indépendant et Performance) : oui / non
- [ ] Note SMS de Performance dans le comparateur et la FAQ : n'afficher « 50 SMS crédités / mois » qu'à la livraison de L15 (proposé) : oui / non
- [ ] Colonne Équipe : passer aussi « Campagnes et relances clients » et « Domaine personnalisé » à « Bientôt disponible » (proposé) : oui / non

## Périmètre
- `lib/pricing/plans.ts` : champ `upcomingFeatures` ; Performance : `includedFeatures` sans `automations` ni `marketing`, nouvelle description et nouveaux points forts.
  **Inchangés :** `availability`, `cta`, `trial`, prix, `PRICING_COPY` des essais.
- `components/marketing/v4/pricing-data.ts` : cellule `boolean | "soon"`, `getPlanUpcomingFeatures`, ligne CA → `proUp`.
- `components/marketing/v4/pricing.tsx` : section « Prochainement » (carte et volet), cellule « Bientôt disponible » dans les 2 comparateurs.
- `components/marketing/v4/faq-data.ts` (l. 40), libellés de `app/admin/(dashboard)/abonnement/page.tsx` (affichage seulement).
- Projet de CGV : fichier séparé, **non branché** (`docs/` ou brouillon), soumis à relecture.
- **Hors périmètre (interdit) :** prix, `PLAN_MATRIX`, `PLAN_META`, `SAAS_ADMIN_CHECKOUT_PLANS`, `DESIRED_PLANS`, objets Stripe, SMS, commissions,
  essai, fidélité, migrations, abonnements existants, `feat/cleanyzer-v3-integration`, `feat/facturx-*`.

## Critères d'acceptation
- [ ] A1 `upcomingFeatures ∩ includedFeatures = ∅` pour chaque offre ; `PLAN_MATRIX` strictement identique (comparaison exacte avec `main`).
- [ ] A2 Rendu serveur (`renderToStaticMarkup`) : aucune fonction future avec une coche ni sous « Fonctionnalités incluses ».
- [ ] A3 Chaque cellule « soon » contient un texte visible « Bientôt disponible » ; icône en `aria-hidden` ; aucun contrôle désactivé.
- [ ] A4 Texte P11 présent mot pour mot ; aucune date ni aucun nom de mois dans les textes « Prochainement ».
- [ ] A5 Libellés P6 identiques sur la landing, le comparateur, le volet, la FAQ et l'admin.
- [ ] A6 « Chiffre d'affaires & panier moyen » coché pour Indépendant ; « Analyse avancée & répartition du CA » reste Performance.
- [ ] A7 Performance et Équipe toujours `coming_soon`, sans aucun lien d'achat ; `SAAS_ADMIN_CHECKOUT_PLANS` et `DESIRED_PLANS` inchangés.
- [ ] A8 (manuel, développeur) contraste ≥ 4,5:1 en clair et en sombre, aucun défilement horizontal à 360 px, parcours clavier, lecteur d'écran.

## Tests à ajouter
- `tests/pricing-upcoming-features.test.ts` : A1, A4, A5, A6.
- `tests/pricing-render-upcoming.test.ts` : A2, A3 (rendu serveur).

## Tests existants à modifier (modification explicitement approuvée dans le plan du lot)
- `tests/pricing-plan-details.test.ts` (dérivation depuis `COMPARE_CATEGORIES`, état « soon »).
- `tests/pricing-source.test.ts` : l'invariant « features promises ⊂ droits du plan » est **conservé**.
- `tests/launch-lot1-hardened.test.ts` : **aucun changement attendu** dans L13 (Performance reste `coming_soon`).

## Tests de non-régression (existants)
- `tests/pricing-source.test.ts`, `tests/pricing-plan-details.test.ts`, `tests/launch-lot1-hardened.test.ts`, `tests/home-plans-order.test.ts`,
  `tests/analytics-analyse.test.ts`.
