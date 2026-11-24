# L79 — Cleanyzer : nombre d'avis et note Google en direct (fini le chiffre figé)

Risque : faible (affichage d'un seul site client). Aucune migration, aucun paiement, aucun envoi.

## Demande du client (Tom, Cleanyzer, 24/11)
« Le slider avis Google n'est pas connecté : j'en ai 96, ça marque 92. »

## Constat
Le site sur mesure affiche `BRAND.googleReviewCount` (92) écrit à la main dans `components/custom-sites/cleanyzer/content.ts`
(repris dans `hero.tsx`). La plateforme sait déjà lire la note et le nombre d'avis en direct : `getTenantGoogleRating`
(`lib/reviews/public.ts`, API officielle Google Places, cache serveur, aucune donnée d'avis stockée).

## À faire
1. Sur le site Cleanyzer (haut de page et section avis), afficher la note et le nombre d'avis renvoyés par
   `getTenantGoogleRating` pour le tenant Cleanyzer (rendu serveur, cache existant ; pas d'appel depuis le navigateur).
2. Repli : si Google ne répond pas ou si aucun établissement n'est relié, garder la valeur écrite à la main (92 → mettre 96).
3. Si l'établissement Google n'est pas encore relié pour Cleanyzer, le dire dans le rapport (réglage à faire dans
   Paramètres → Avis par Clément) ; ne rien inventer.
4. Le JSON-LD (`aggregateRating`) suit la même source que l'affichage. Aucun autre client touché.

## Vérification
- Tests : valeur Google affichée quand disponible, repli quand Google échoue, aucun appel côté navigateur.
- Capture du haut de page. Aucune mention d'IA ni de Claude visible.
