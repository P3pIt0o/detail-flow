# L31 — « 0 % de commission » sur la carte Indépendant de Mon abonnement

Risque : CRITIQUE par classement du dossier (`app/admin/(dashboard)/abonnement/**`), mais changement d'affichage seulement.
Branche partie de `main` après L29, L30 et le kit 2.1.7.

## Constat (Clément, 26/10/2026, compte Essentiel, mobile)

Admin › Mon abonnement › « Passer à la formule supérieure » : la carte Indépendant affiche le prix, « 30 jours gratuits »
et le texte d'essai, mais **aucune mention de la commission**. Or depuis L29, Indépendant est à 0 % de commission
(paiements en ligne et abonnements clients) et c'est l'argument d'upgrade retenu par Clément (décision C1, 25/10/2026).

## Décisions (tranchées)

- [x] Sur la carte Indépendant de cet écran, ajouter sous « 30 jours gratuits », avec la même coche :
  **« 0 % de commission sur vos paiements et abonnements »** (texte déjà validé dans L29 pour les cartes de tarifs).
- [x] Le texte vient de la même source que les cartes de tarifs (pas de chaîne en dur dupliquée si une source commune existe).
- [x] Aucun autre changement : prix, bouton, essai, cartes Performance et Équipe, comportement du bouton inchangés.
- [x] Affiché uniquement aux tenants qui ne sont pas déjà sur Indépendant ou au-dessus (comme la carte elle-même).

## Critères d'acceptation

- [ ] A1 Compte Essentiel : la ligne apparaît sur la carte Indépendant, juste sous « 30 jours gratuits ».
- [ ] A2 Le texte affiché est strictement identique à celui des cartes de tarifs (test).
- [ ] A3 Aucun changement de lien, de bouton, de prix ni de droit (test de non-régression existant de la page abonnement).
- [ ] A4 Rendu mobile 360 px sans débordement.

## Aperçu

Aperçu obligatoire (interface) : la carte Indépendant avant / après, mobile 390 px et ordinateur 1280 px, fond sombre de l'admin.

## Hors périmètre

Tout autre texte de l'écran, les cartes Performance et Équipe, Stripe, les prix, les commissions réelles.
