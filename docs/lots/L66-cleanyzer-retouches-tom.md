# L66 — Cleanyzer : retouches demandées par Tom (zones en slider, boutons du haut de page)

Risque : faible (affichage seulement, un seul site client : Cleanyzer). Aucune migration, aucun paiement, aucun envoi.

## 1. Section « zone par zone » du bas de page → slider (comme la visite de la Porsche)
- Aujourd'hui elle se pilote au défilement : le visiteur est obligé de rester dessus. Tom : « c'est vraiment relou ».
- La transformer en slider sur le même modèle que la visite de la Porsche (réutiliser son composant ou son comportement) :
  flèches précédent / suivant, points de position, glissement au doigt sur mobile, flèches du clavier sur ordinateur.
- Le défilement de la page n'est plus jamais bloqué. Même contenu (zones, textes, images ou vidéos, prix), même style néon.

## 2. Haut de page (hero)
- **Mobile** : les deux boutons d'appel à l'action n'apparaissent pas sous le titre (voir capture : titre, sous-titre,
  liste des prestations, avis Google, mais aucun bouton). Les afficher, bien visibles, au-dessus de la ligne de flottaison si possible.
- **Ordinateur** : retirer les onglets de navigation en haut de page. Ne garder que les deux appels à l'action
  (les deux boutons déjà présents : réservation et demande personnalisée / devis — garder leurs libellés et leurs liens actuels).
- Le logo reste. Le menu burger mobile reste tel quel.

## 3. À ne pas toucher
Haut de page néon (vidéo), visite de la Porsche, formules, réservation automobile, formulaire textile, carte de la zone
d'intervention (référencement local), avis Google, pied de page. Aucune donnée supprimée. Aucun autre client touché.

## Avant de coder
Aperçu visuel avant / après (mobile et ordinateur) : haut de page et section des zones.

## Vérification
- Tests existants verts, build OK.
- Captures mobile (390 px) et ordinateur (1440 px) : boutons visibles sur mobile, plus d'onglets sur ordinateur,
  la page défile librement jusqu'en bas, le slider change de zone aux flèches et au doigt.
- Aucune mention d'IA ni de Claude dans ce qui est visible par le client.
