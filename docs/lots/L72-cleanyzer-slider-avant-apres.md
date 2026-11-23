# L72 — Cleanyzer : remplacer les photos des sliders AVANT / APRÈS existants par les vraies photos de Tom

Risque : faible (affichage seulement, un seul site client : Cleanyzer). Aucune migration, aucun paiement, aucun envoi. URGENT.

## Demande (Clément, 23/11/2026)
Le site Cleanyzer a déjà des sliders / comparateurs AVANT / APRÈS. Il faut remplacer leurs images actuelles par les photos
avant / après fournies par Tom. Ce sont de vraies réalisations : on les montre telles quelles, sans retouche ni texte inventé.
NE PAS toucher au slider « Chaque étape, filmée » ni à la visite « zone par zone ».

## Médias fournis (dossier docs/lots/L72-medias/, déposé sur la branche par le superviseur)
5 paires, en .webp (et .jpg de secours), à copier dans le dossier public des images de Cleanyzer :
1. moteur-avant / moteur-apres — « Compartiment moteur »
2. sieges-tissu-avant / sieges-tissu-apres — « Sièges en tissu : taches »
3. optiques-avant / optiques-apres — « Rénovation des optiques »
4. habitacle-beige-avant / habitacle-beige-apres — « Habitacle complet »
5. utilitaire-avant / utilitaire-apres — « Utilitaire professionnel »

## À faire
- Trouver le ou les sliders / comparateurs avant / après existants du site Cleanyzer et remplacer leurs images par ces 5 paires
  (ajuster le nombre de diapositives à 5 ; titres courts ci-dessus ; étiquettes « Avant » / « Après »).
- Garder le composant, le style et le fonctionnement existants (glissement de la poignée, navigation). Pas de prix inventés,
  pas de marques citées.
- Images en lazy-loading, dimensions fixées (pas de saut de mise en page), texte alternatif descriptif.
- Les anciennes images ne sont plus affichées (ne pas supprimer les fichiers du dépôt).
- Ne rien toucher d'autre : « Chaque étape, filmée », visite « zone par zone », hero (L71), formules, réservation, carte, pied de page.
- S'il n'existe aucun slider avant / après sur le site Cleanyzer, le dire dans le plan au lieu d'en inventer un.

## Avant de coder
Aperçu avant / après de la section en 390 px et 1440 px.

## Vérification
- Tests existants verts, build OK ; test ajouté : 5 diapositives, chacune avec une image « avant » et une « après ».
- Captures mobile et ordinateur. Aucune mention d'IA ni de Claude visible par le client.

## Décision de Clément (23/11/2026)
garder la paire RS3 en premier et ajouter les 5 nouvelles paires de Tom après (6 paires au total)
Ne pas redemander cette décision.

## Décision de Clément (23/11/2026)
accueil uniquement (6 paires, RS3 en premier) ; mettre aussi la paire optiques de Tom sur la page optiques ; garder les autres photos des pages prestations ; n'afficher le paragraphe de description que s'il contient du texte
Ne pas redemander cette décision.
