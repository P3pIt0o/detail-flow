# L9 — Réservations et widgets (MOYEN ; CRITIQUE si paiements/acomptes touchés)

## Objectif
Fiabiliser le parcours de réservation (page publique, widget V2, embed) : disponibilités, options, déplacements, acomptes,
codes promo, annulations, sans régression sur les sites personnalisés.

## Dépendances
Audit possible maintenant (lecture seule). Implémentation : pas en parallèle d'un lot Stripe (L1, L3, L7, L8) si acomptes touchés.

## Constat (16/10/2026, `main` @ c7c997d)
- Moteur : `lib/booking/` (`availability.ts`, `v2.ts`, `draft.ts`, `pricing.ts`, `travel.ts`, `cancel.ts`, `rate-limit.ts`,
  `online-booking-access.ts`, `location*.ts`, `status.ts`, `queries.ts`, `setup-status.ts`).
- Pages : `app/book/[slug]`, `app/(site)/reservation/page.tsx`, admin `app/admin/(dashboard)/ma-reservation/page.tsx`.
- Embed : `lib/embed/snippet.ts` ; codes promo : `lib/promo/service.ts` ; acomptes/paiements via `lib/payments/` (CRITIQUE).
- Tests existants : `booking-v2`, `booking-draft`, `booking-self-cancel`, `booking-engine-decoupling`, `booking-distribution-schema`,
  `booking-quote-tenant-isolation`, `public-booking-access`, `reservation-embed-module`, `widget-tenant-contact`, `book-link-page`,
  `custom-site-booking-admin`, `promo-targeting`.
- Branche active non fusionnée liée : `feat/cleanyzer-v3-integration` (15/10) — ne pas créer de conflit.
- **Règle confirmée (16/10/2026) : `feat/cleanyzer-v3-integration` est préservée intégralement** (ni modification, ni rebase,
  ni fusion, ni suppression par un agent ; branche protégée dans le kit, lecture seule). Toute correction touchant Cleanyzer attend
  ta décision sur cette branche.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Problèmes concrets constatés à corriger (liste, avec tenant et parcours) : ____
- [ ] Règles d'acompte et de remboursement en cas d'annulation (si à changer) : ____
- [ ] Délai minimal / maximal de réservation, gestion des créneaux simultanés : ____

## Périmètre
Audit d'abord (rapport des écarts), puis corrections validées dans `lib/booking/**`, `app/book/**`, `app/(site)/reservation/**`, `lib/embed/**`.
Hors périmètre : personnalisations des sites clients (`components/custom-sites/**`) sauf accord explicite.

## Critères d'acceptation
- [ ] Deux réservations concurrentes sur le même créneau : une seule acceptée (test).
- [ ] Fuseau du tenant respecté (test avec un fuseau ≠ Europe/Paris) ; changement d'heure été/hiver testé.
- [ ] Paiement/acompte uniquement simulé dans les tests ; aucun appel Stripe réel.
- [ ] Emails de notification envoyés au contact du tenant concerné uniquement (test A/B).
- [ ] Lien public vs code embed : même tenant, mêmes options, aucun accès aux données d'un autre tenant.
- [ ] Rendu mobile du widget V2 vérifié (étapes, boutons, débordements) — vérification manuelle décrite.

## Tests de non-régression (existants)
Les 12 fichiers listés dans le constat (`tests/booking-*.test.ts`, `tests/public-booking-access.test.ts`,
`tests/reservation-embed-module.test.ts`, `tests/widget-tenant-contact.test.ts`, `tests/book-link-page.test.ts`,
`tests/custom-site-booking-admin.test.ts`, `tests/promo-targeting.test.ts`).
