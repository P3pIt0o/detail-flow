# L33 — Remettre les photos Spirit (L32) sans casser la page Paramètres

Risque : CRITIQUE (dépendances, page Paramètres de tous les tenants). Branche partie de `main`, avec le code de L32
ré-appliqué par Clément (`git revert 0de868c`, le revert du revert).

## Constat (incident du 27/10/2026)

L32 fusionné (PR #277, 98776ce) → **erreur 500 sur Admin › Paramètres pour TOUS les comptes**, Spirit ou non.
Annulé par la PR #278 (0de868c). Cause probable : `lib/custom-sites/spirit-photo-optimize.ts` fait `import sharp from "sharp"`
au niveau du module ; la page Paramètres importe `spirit-photos-actions.ts`, qui importe ce module : si `sharp` ne se charge
pas sur Vercel, toute la page tombe. Dans `package.json`, `sharp` est en **devDependencies** (^0.35.4) et le lockfile
contient deux versions (0.34.5 via Next, 0.35.4).

## Décisions (tranchées, Clément 31/10/2026)

- [x] Tout le comportement fonctionnel de L32 est conservé à l'identique (fiche `docs/lots/L32-spirit-photos-prestations.md`).
- [x] `sharp` est chargé **uniquement à l'appel de l'optimisation** (import dynamique `await import("sharp")` dans
  `optimizeSpiritPhoto`), jamais à l'ouverture d'une page. Si le chargement échoue : message clair « La photo n'a pas pu
  être traitée, réessayez plus tard », journalisé, et la page reste fonctionnelle.
- [x] `sharp` passe en **dependencies** (production). Aligner sur une seule version si possible sans effet de bord ;
  sinon le signaler dans le rapport.
- [x] Aucun autre changement.

## À établir pendant l'AUDIT

- Tous les endroits où `sharp` (ou un module qui l'importe) est chargé au niveau module depuis une page ou un layout.
- Si `next.config.mjs` doit lister `sharp` dans `serverExternalPackages` (fichier critique : seulement si nécessaire, justifié).

## Critères d'acceptation

- [ ] R1 Test : le module de la page Paramètres et `spirit-photos-actions.ts` se chargent **même si `sharp` est introuvable**
  (simulation d'échec d'import) ; seule l'action d'enregistrement d'une photo renvoie l'erreur prévue.
- [ ] R2 Aucun `import ... from "sharp"` statique hors des fonctions d'optimisation (test ou contrôle).
- [ ] R3 `sharp` dans `dependencies` ; build et tests OK.
- [ ] R4 Tous les critères S1 à S8 de L32 restent verts.
- [ ] R5 Le nombre de tests en échec et d'erreurs TypeScript n'augmente pas.

## Aperçu : sans objet — aucun changement visible par rapport à L32 (déjà validé).

## Test OBLIGATOIRE sur la Preview AVANT fusion (Clément)

1. Preview › /admin connecté avec un compte **non Spirit** › **Paramètres s'affiche** (pas de 500).
2. Même chose avec le compte de test detailflow.
3. Si un compte Spirit existe en dev : envoi d'une photo → WebP affiché ; sinon test en production juste après fusion,
   en commençant par ouvrir Paramètres avec un compte normal (retour arrière immédiat via « Revert » si 500).
