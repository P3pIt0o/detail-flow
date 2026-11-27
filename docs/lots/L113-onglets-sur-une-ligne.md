# L113 — Onglets de l'admin sur une seule ligne sur téléphone (retour de Clément, 27/11 14 h 40)

Risque : faible (affichage seulement). Juste après L74. Capture : `docs/lots/L113-medias/onglets-qui-passent-a-la-ligne.jpg`
(page « Prestations & tarifs » : l'onglet « Options » passe seul sur une 2ᵉ ligne, sous la barre).

## À faire
1. Barre d'onglets de « Prestations & tarifs » : libellés courts **Prestations · Tarifs · Véhicules · Options** (la page garde son titre et son
   sous-titre), sur **une seule ligne** dès 360 px de large, cibles ≥ 44 px, onglet actif bien visible.
2. Règle générale pour **toutes** les barres d'onglets de l'admin (composant commun si possible) : jamais de retour à la ligne ; si les onglets ne
   tiennent pas, défilement horizontal au doigt avec un léger fondu sur le bord, l'onglet actif ramené en vue.
3. Rien d'autre ne change (mêmes adresses d'onglets, mêmes contenus).
4. Test : rendu à 360 px et 390 px sans retour à la ligne (vérification visuelle dans le rapport) ; test de composant sur la classe sans retour à la ligne.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
