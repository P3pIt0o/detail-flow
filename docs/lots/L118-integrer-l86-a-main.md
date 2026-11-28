# L118 — Intégrer L86 (reprise de la carte digitale) à main

Risque : moyen (réglages admin et tests ; aucune migration nouvelle, aucun paiement). URGENT : L86 est fini mais sa PR #317 ne peut plus
être fusionnée (conflits avec L97 « refonte des paramètres » et L113 « onglets sur une ligne », fusionnés après le début de L86).
Ce lot remplace la PR #317 (Clément la fermera après la fusion de L118).

## À faire
1. Sur la branche du lot (partie de main), intégrer tout L86 : `git merge --no-ff origin/lot/L86-reprise-carte-digitale`.
2. Conflits attendus (3) : `lib/admin/settings-nav.ts`, `tests/l44-demandes-speciales.test.ts`, `tests/settings-nav.test.ts`.
   Résolution déjà décidée : la catégorie s'appelle « Ma page de réservation » (L97) et contient aussi « Carte digitale » (L86) ;
   en `booking_only` elle garde « Demandes spéciales » ET « Carte digitale » ; `NEW_TABS = ["notifications", "deposit", "digital-card"]`.
3. Tests de L97 à mettre en accord avec L86 (ils échouent après la fusion) :
   - `tests/l97-parametres-refonte.test.ts` : ajouter `["digital-card", "site", "Ma page de réservation"]` à MOVES ; en `booking_only`,
     la catégorie « site » a 2 sous-onglets ; la page des paramètres doit contenir `id="reglage-digital-card"` ; ajouter la ligne
     `?tab=digital-card` (« Ma page de réservation ») dans `docs/audits/L97-correspondance.md`.
   - `tests/l97-corrections.test.ts` « Spirit : pas de lien ni QR code » : **règle L102 conservée** — pour un site sur mesure,
     la recherche des réglages ne propose ni lien ni QR code (la carte digitale, qui affiche un QR code, n'y apparaît pas non plus).
   - Lancer TOUTE la suite de tests (pas seulement ceux-là) : aucun autre test de L97, L102, L113 ou L86 ne doit casser.
4. Ne rien changer d'autre au comportement de L86, L97, L102 ou L113.

## Hors périmètre
Toute nouvelle fonctionnalité. Aucune décision de Clément nécessaire (tout est déjà décidé par L86, L97, L102).

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
