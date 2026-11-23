# L71 — Cleanyzer : descendre les deux boutons du haut de page sur mobile

Risque : faible (affichage seulement, un seul site client : Cleanyzer, CSS du hero mobile). Aucune migration, aucun paiement, aucun envoi.

## Demande (Clément, 23/11/2026, après la mise en ligne de L66)
Sur mobile, les deux boutons « Réserver mon nettoyage » et « Voir les tarifs » sont trop haut : ils se posent sur la Porsche
juste sous le sous-titre. Il faut les descendre plus bas, pour ne pas gâcher la voiture.

## À faire
- Mobile uniquement (≤ 760 px) : placer les deux boutons plus bas dans le hero, sous la voiture, juste au-dessus de la ligne
  « NETTOYAGE AUTO • DETAILING • MATELAS… » (et donc au-dessus du badge des avis Google), sans chevaucher la carrosserie.
- Garder leurs libellés, liens, couleurs et tailles actuels. Ils restent visibles sans défiler sur un écran de 390 × 844.
- Ordinateur : ne rien changer.
- Ne rien toucher d'autre (sliders de L66, visite, formules, réservation, carte, pied de page).

## Avant de coder
Aperçu avant / après en 390 px et 360 px.

## Vérification
- Tests existants verts, build OK ; test ajouté : sur mobile les boutons sont sous la voiture et au-dessus de la liste des prestations.
- Captures 390 px et 360 px.
- Aucune mention d'IA ni de Claude dans ce qui est visible par le client.
