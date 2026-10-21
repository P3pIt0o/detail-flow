# L21 — Écran admin « Offres & réductions » (ex-« L17-F »)

Risque : **moyen** (interface admin). Plan approuvé : `.lot-state/L21.plan.md`.

## Ce qui change
- Nouvelle entrée de menu **« Offres & réductions »** (groupe Gestion), masquée pour Spirit ACS et Rozan.
- Page `/admin/offres` en trois onglets :
  - **Offres** : création (désactivée), modification, activation, duplication et suppression avec confirmation. Paliers en % ou en €, dates de validité, cumul. Un aperçu chiffré sur un panier d'exemple tiré du catalogue (prix de base) et les alertes de paliers s'affichent en direct.
  - **Équivalences** : même traitement sous deux formes, motif obligatoire, créées désactivées.
  - **Compléments suggérés** : 5 au plus par prestation, message facultatif, créés désactivés.
- Saisie en euros et en pourcentages, convertie en centimes et en points de base par `lib/booking/promotions-form.ts` (pur, testé). Aucun flottant n'est envoyé.
- Les employés voient la page en lecture seule. Le contrôle réel reste celui des actions serveur L19 (`requireCompanyRole(["OWNER","ADMIN"])`).

## Écart au plan (signalé)
- `lib/booking/promotions-store.ts` : la liste admin des équivalences renvoie aussi leur état `active`. Sans cela, l'interface ne pouvait pas afficher si une équivalence est active.
  - Modification additive d'une ligne, en lecture seule, bornée au tenant comme avant.
  - Aucune autre écriture ni requête nouvelle.

## Inchangé
Actions serveur L19/L20, réservation publique, paiements, Stripe, migrations.
