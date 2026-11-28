# L86 — Reprise de L45 « carte digitale du detailer » sur la version actuelle de main

Lot délégué par Clément (feu vert, 27/11). Il veut fusionner L45, mais la branche `lot/L45-carte-digitale-detailer` (09/11) est sur
l'**ancien historique** de main (réécrit depuis le 24/11) : GitHub refuse de la fusionner (« unrelated histories ») et, forcée, elle
ramènerait ~940 anciens commits et annulerait des dizaines de lots. **Ne jamais fusionner ni réutiliser cette branche telle quelle.**

## À faire
1. Partir de main à jour. Reporter **uniquement** les 3 commits de L45, dans l'ordre : `b4b971d` (carte /carte, vCard, réglages
   « Carte digitale », QR code, tests), `eb3285b` (fiche du lot), `89c4839` (effet d'inclinaison extrait + tests). Pas de migration,
   pas de changement de schéma.
2. Deux conflits attendus (vérifiés le 27/11) : `lib/admin/settings-nav.ts` et `tests/super-admin-public-presentation.test.ts`.
   Garder tout ce qui existe dans main et ajouter seulement l'entrée « Carte digitale » de L45 (même place dans le menu des réglages
   que dans L45 ; ne pas créer d'entrée dans le menu principal).
3. Remettre au goût du jour ce qui a changé depuis le 09/11 : le code doit utiliser les fonctions actuelles de main (marque via
   `lib/brand.ts`, `requireCompanyMember()` pour les actions admin, `resolvePublicRequestTenant()` côté /carte), sans dupliquer
   un utilitaire existant. Tests « le tenant B ne voit/modifie pas la carte du tenant A » (action de réglages et route /carte/contact).
4. Les sites sur mesure (Cleanyzer, Spirit ACS, JustClean) ne changent pas : la carte vit sur /carte de la page publique standard.
5. Tests de L45 (`tests/l45-*.test.ts`) verts + `tests/settings-nav.test.ts` + suite rapide du kit.

## Aperçu
`.lot-state/L86.apercu.html` : la carte sur téléphone et l'onglet de réglages (repris de l'aperçu de L45 s'il existe).

## Après fusion de L86
La branche `lot/L45-carte-digitale-detailer` peut être supprimée par Clément (elle ne sert plus).

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
