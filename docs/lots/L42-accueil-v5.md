# L42 — Nouvelle page d'accueil detailflow.fr (maquette du 25/10 validée)

Risque : NORMAL (vitrine marketing uniquement ; aucune donnée, aucun paiement). Branche partie de `main`.
Référence visuelle et textes EXACTS : `docs/lots/L42.apercu.html` (maquette validée par Clément le 08/11/2026).
Médias : `public/marketing/v5/` (5 vrais écrans de l'app, noms masqués) et `public/marketing/v5/logos/` (4 logos clients).
Ils sont ajoutés sur la branche avant l'implémentation (commit « médias L42 »).

## Périmètre
`app/marketing/page.tsx`, nouveaux composants `components/marketing/v5/**`, tests `tests/l42-*.test.ts`.
Les composants `components/marketing/v4/**` ne sont PAS supprimés (retour arrière simple) ; ils ne sont plus utilisés par
l'accueil. Le drapeau maintenance (`lib/marketing/maintenance.ts`, `MARKETING_MAINTENANCE`) n'est pas modifié.

## Décisions (Clément, 08–09/11/2026)
- [x] Sections dans l'ordre de la maquette : en-tête collant (Fonctionnalités, Tarifs, Blog, Questions, Connexion, Essayer
  gratuitement) · hero (sur-titre, H1 « Votre agenda se remplit tout seul. Vos acomptes aussi. », texte, 2 boutons, mention
  « Gratuit pour commencer, sans carte bancaire » + lien Trustpilot, capture `ecran-reservations.webp` et sa légende) ·
  bande « Ils l'utilisent tous les jours » (4 logos) · « Prêt en une soirée » (3 étapes) · 3 blocs fonctions avec captures ·
  bloc avis sombre (3 citations Trustpilot MOT POUR MOT, avec nom, ville, « avis Trustpilot, août 2026 ») · tarifs · FAQ (4) ·
  appel final · pied de page.
- [x] Typographie, couleurs, espacements : ceux de la maquette (Schibsted Grotesk via `next/font/google`, fond #f7f5f0,
  bleu #1d5fd0). Un seul H1.
- [x] Liens : « Essayer gratuitement » / « Créer mon espace » → `/demarrer` ; « Essayer 30 jours » → `/demarrer?plan=PRO` ;
  Connexion → `/admin/login` ; « Voir le logiciel » et « Toutes les fonctionnalités » → `#fonctions` pour l'instant (la page
  Fonctionnalités = lot L43) ; Blog → masqué tant que le blog n'existe pas (lot suivant) ; Trustpilot → l'URL déjà utilisée
  dans `components/marketing/v4/trustpilot.tsx` ; pied : liens légaux existants.
- [x] Tarifs : montants, commissions et plafonds lus depuis `lib/pricing/plans.ts` / `COMMISSION_RULES` (jamais en dur) ;
  Performance affiché « Bientôt disponible » si `coming_soon`. Badge « le plus choisi » sur Indépendant, comme la maquette
  (décision Clément). Note Trustpilot 4,2/5 : confirmée réelle par Clément.
- [x] Pied de page : « Besoin d'un site vitrine ? Nous le créons pour vous » SANS prix dans ce lot (le prix 790 € viendra de
  `CUSTOM_SITE_OFFER`, créé par L41 ; il sera ajouté par L43, une fois L41 fusionné).
- [x] SEO conservé : title, description, canonical, Open Graph, JSON-LD existants de `app/marketing/page.tsx`/layout ;
  FAQPage JSON-LD mis à jour avec les 4 questions de la maquette. Images `next/image` avec `alt` de la maquette, dimensions
  fixes (pas de CLS), hero en `priority`.
- [x] Logos clients : les 4 (accord des clients confirmé par Clément), liste dans UNE constante `CLIENT_LOGOS` de `components/marketing/v5/`.
- [x] Mobile : en dessous de 720 px, liens d'en-tête masqués (Connexion + bouton gardés), sections empilées.
- [x] Aucun texte de vente inventé : uniquement les textes de la maquette.

## Critères d'acceptation
- [ ] C1 Rendu conforme à la maquette en 1440 px et 390 px (captures dans le rapport).
- [ ] C2 Tous les liens listés ci-dessus mènent au bon endroit (test).
- [ ] C3 Aucun montant en dur dans `components/marketing/v5/**` (test) ; 3 citations identiques à la maquette (test).
- [ ] C4 Un seul H1 ; JSON-LD valide (test) ; Lighthouse mobile ≥ 90 visé (mesure Preview).
- [ ] C5 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant.

## Après fusion (Clément)
Regarder la Preview (variable `MARKETING_MAINTENANCE=false` déjà mise en Preview), puis passer la variable à `false` en
Production pour ouvrir la vitrine.
