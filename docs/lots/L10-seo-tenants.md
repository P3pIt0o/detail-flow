# L10 — SEO autonome pour tenants sans domaine (MOYEN)

## Objectif
Aider les pros qui gèrent eux-mêmes leur page DetailFlow à améliorer leur référencement (mini-guide + diagnostic des contenus
qu'ils peuvent modifier), sans jamais promettre de position Google.

## Dépendances
Règle commerciale d'éligibilité (ci-dessous). Ne touche pas aux sites personnalisés (L11).

## Constat (16/10/2026, `main` @ c7c997d)
- **Aucun tenant n'a de domaine personnalisé aujourd'hui** : `lib/seo/tenant-url.ts` prévoit un futur `customDomain` vérifié,
  mais aucune colonne n'existe ; les URLs publiques sont `{slug}.detailflow.fr` / `?tenant=`. « Tenant sans domaine » = tous les tenants standards.
- SEO existant : `lib/seo/` (`tenant-metadata.ts`, `tenant-seo.server.ts`, `structured-data.ts`, `robots.ts`, `tenant-url.ts`), test `tests/seo-robots.test.ts`.
- Sites personnalisés (Cleanyzer, Rozan, Spirit ACS) ont leur propre SEO : hors périmètre.

## Décisions à confirmer — BLOQUANT — VALIDATION HUMAINE
- [ ] Qui y a droit (tous les plans ? plans payants ? tenants standards uniquement) : ____
- [ ] Contenus du diagnostic (titre, description, prestations, ville, photos, avis…) : ____
- [ ] Format du guide (page admin, checklist, email) : ____

## Critères d'acceptation
- [ ] Aucune URL canonique, aucun sitemap ni robots modifié pour les tenants existants sans accord.
- [ ] Le diagnostic ne lit que les données du tenant connecté (test A/B) ; réglages SEO modifiables uniquement par ses membres autorisés.
- [ ] Aucune phrase ne garantit un classement ou un résultat.
- [ ] Sites personnalisés inchangés (tests existants verts).

## Tests de non-régression (existants)
`tests/seo-robots.test.ts`, `tests/custom-sites-server.test.ts`, `tests/admin-tenant-link.test.ts`, `tests/admin-public-link.test.ts`
