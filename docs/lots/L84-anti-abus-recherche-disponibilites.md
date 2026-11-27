# L84 — Anti-abus sur la recherche de la première disponibilité (suite de L73)

Risque : moyen. Aucune migration si possible, aucun paiement.

## Pourquoi
Contre-expertise de L73 : la recherche publique de la première date disponible peut calculer jusqu'à 180 jours par ouverture
(≈ 13 fois l'action actuelle). Quelqu'un qui recharge en boucle pourrait ralentir la base pour tous les pros.

## À faire
- Appliquer à cette recherche la même protection anti-abus que la création de réservation (ou une limite dédiée par adresse IP + pro),
  avec réponse propre « Trop de demandes, réessayez dans un instant » côté client.
- Lire réglages, horaires et congés une seule fois par recherche ; plafond de 180 jours conservé.
- Tests : au-delà de la limite → refus propre ; usage normal → inchangé ; isolation entre pros.

## Note (26/11)
Reprise propre de L76 depuis main à jour. Ne rien reprendre de la branche lot/L76-* (elle contient un enregistrement qui a supprimé des fichiers par erreur).

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
