# L4 — Landing et FAQ alignées sur la réalité

## Objectif
Tout ce que la landing, la page tarifs et la FAQ promettent est vrai, et chaque chiffre est lu depuis la source du code.

## Dépendances
**L0 (décisions D1, D2, D9, D11, D12), L1, L2 et L3 terminés et mergés** (et L7 si le palier fidélité est affiché). Sinon les chiffres affichés seront faux ou à refaire. Ne pas lancer avant.

## Constat dans le code (revérifié le 16/10/2026, `main` @ c7c997d)
Tarifs : `components/marketing/v4/pricing-data.ts`, `pricing.tsx` ; Performance et Équipe affichés « bientôt ».
Landing : `components/marketing/` (v4 : `components/marketing/v4/`, FAQ `components/marketing/v4/faq-data.ts` et `faq.tsx`),
contenus `config/marketing.ts`, page `app/marketing/`.

## Décisions (tranchées)
Aucune : le contenu marketing est ta décision.

## Décisions à confirmer
- [ ] Fonctionnalités à afficher « bientôt » plutôt que disponibles (liste) : ____
- [ ] Fonctionnalités à retirer de la landing : ____
- [ ] Questions de FAQ à ajouter, modifier ou supprimer (ou « inchangées ») : ____
- [ ] Mise en avant de l'annuel (L3) sur la page tarifs : ____
- [x] Les 4 offres publiques (Essentiel, Indépendant, Performance, Équipe) restent affichées avec leurs prix actuels (décision du 16/10).

## Périmètre
`components/marketing/**`, `config/marketing.ts`, JSON-LD FAQPage s'il existe. Hors périmètre : logique de prix (L1–L3).

## Critères d'acceptation
- [ ] Chaque prix, taux, quota ou limite affiché est importé de sa constante source (aucune valeur recopiée en dur), prouvé par un test.
- [ ] Les fonctionnalités listées « bientôt » ne sont pas présentées comme disponibles (texte et badges).
- [ ] La FAQ affichée et son JSON-LD (s'il existe) ont le même contenu.
- [ ] Liens CTA (inscription, essai, contact) aboutissent au bon parcours ; métadonnées SEO cohérentes.
- [ ] Accessibilité de base : titres hiérarchisés, contrastes, textes alternatifs, navigation clavier.
- [ ] Mobile 375 px : aucune section dupliquée, aucun débordement horizontal (vérification manuelle décrite dans le rapport).

## Tests à ajouter
- Test de cohérence affichage ↔ constantes (prix mensuels/annuels, commissions, SMS inclus).

## Tests de non-régression (existants)
`tests/pricing-source.test.ts`, `tests/pricing-plan-details.test.ts`, `tests/home-plans-order.test.ts`
