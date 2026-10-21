# L23 — Prix du récapitulatif lié au panier affiché

Risque : **critique** (réservation publique, montant présenté avant confirmation). Plan approuvé : `.lot-state/L23.plan.md`.
Base : `main` après fusion L21 + L22.

## Origine
Patch fourni par le propriétaire : `L23-prix-recapitulatif.patch`, appliqué après la baseline. Son test est renommé
`tests/l23-pricing-freshness.test.ts`.

## Problème
En L22, le prix calculé par le serveur pour le récapitulatif était conservé sans référence au panier qui l'avait
produit. Après une modification du panier (prestation, option, véhicule, adresse, code), l'ancienne réponse pouvait
encore s'afficher comme « Total ». La confirmation restait aussi possible sur l'estimation locale, pendant le calcul
ou après son échec.

## Ce qui change (interface uniquement)
- **Chaque réponse de `getQuoteAction` est liée à son panier** (`pricingKey` : sélections, adresse, code). Une
  réponse calculée pour un autre panier est « en attente », jamais affichée comme actuelle.
- **Confirmation impossible sans prix serveur du panier affiché** (`canConfirmBooking`) : le bouton est désactivé, et
  `submit()` contient la même garde.
- **Échec du calcul** : message « Le prix n'a pas pu être vérifié. » et bouton « Recalculer le prix ».
- « Total » ne s'affiche qu'avec un prix serveur actuel ; sinon, « Total estimé ».

## Inchangé
- `createBookingAction` recalcule toujours le montant depuis la base. Le blocage du bouton est une garantie
  d'interface, pas de sécurité.
- Server actions, moteur de promotions, paiement, Stripe, schéma, migrations, variables d'environnement, ancien tunnel
  (Spirit ACS, Rozan).

## Suite
La limite de débit et les correctifs d'affichage passent en L24 (`docs/lots/L24-limite-promo.md`).
