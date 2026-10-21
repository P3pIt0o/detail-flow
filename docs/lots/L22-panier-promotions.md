# L22 — Panier Booking V2 avec promotions (ex-« L17-E »)

Risque : **critique** (montant présenté et facturé). Plan approuvé : `.lot-state/L22.plan.md`.

## Ce qui change pour le client
- **Panier libre par véhicule** : la prestation choisie à l'étape 1, plus « Ajouter une prestation pour ce véhicule » (sans doublon), avec ses options.
- **Récapitulatif chiffré par le serveur**, avec le même calcul que la réservation :
  - prix normal, offres appliquées et montant de chacune ;
  - code promo, économie, total, acompte et durée ;
  - explication quand un même traitement n'est facturé qu'une fois.
- **Code promo écarté** : le motif est affiché (« Une offre plus avantageuse est déjà appliquée… »), et le récapitulatif l'annonce non appliqué.
- **Au plus 2 suggestions** à l'étape véhicule, avec un bouton « Ajouter » :
  - palier suivant d'une offre ;
  - combinaison à compléter ;
  - compléments du pro.

  Jamais d'ajout automatique, jamais d'élément masqué du catalogue.

## Ce qui change côté serveur
- **Regroupement de confiance** (`trustedVehicleKeys`) : deux lignes ne forment un même véhicule que si elles ont le même préfixe d'identifiant ET exactement le même type, la même marque, le même modèle et la même immatriculation. Sinon, ce sont deux véhicules, et l'anti-fraude de L20 est conservée. Le regroupement est appliqué au devis, à l'aperçu du code et à la création.
- **`getQuoteAction(selections, adresse?, code?)`** renvoie en plus `pricing` (montants serveur) et `suggestions`.
- **Tests de cohérence** : les tests prouvent que l'aperçu et le montant enregistré sont identiques, y compris pour un véhicule à plusieurs prestations, avec une équivalence, une offre et un code.

## Inchangé
- **Sans offre ni équivalence** : montants identiques à L20.
- **Capacité journalière** : une prestation = une place, au serveur comme dans le choix du créneau.
- Paiement, Stripe, commissions, factures, e-mails, ancien tunnel (Spirit ACS, Rozan), schéma, migrations.

## Point ouvert (décision du propriétaire)
- **Capacité par véhicule (D5).** Aujourd'hui, une voiture avec 2 prestations occupe 2 places de `maxVehiclesPerDay`. Compter les véhicules demande une décision et une colonne supplémentaire, donc une migration.
