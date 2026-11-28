# L115 — Le detailer rembourse lui-même un paiement depuis son admin (décision de Clément, 27/11 15 h 40)

Risque : critique (argent, Stripe Connect). Après L113. Aujourd'hui, c'est Clément qui rembourse depuis Stripe : les detailers ne peuvent pas le faire.

## Décisions de Clément
- Le detailer peut rembourser **totalement ou partiellement** un paiement en ligne reçu par DetailFlow : réservation (acompte ou paiement complet)
  et carte cadeau (L74). Les abonnements de ses clients : hors périmètre de ce lot.
- **Les frais Stripe non rendus lors d'un remboursement sont à la charge du detailer** (comme s'il remboursait lui-même son client) : la plateforme ne
  perd rien. L'argent remboursé est repris sur le compte Stripe du detailer.
- La commission DetailFlow éventuelle (offre gratuite) est rendue au prorata du montant remboursé. ⚠️ Point proposé par Claude, à confirmer par
  Clément avant la fusion : le signaler en tête du rapport.

## À faire
1. Bouton « Rembourser » sur la fiche d'un paiement (réservation, carte cadeau) : montant total proposé par défaut, montant partiel possible
   (jamais plus que le reste remboursable), motif facultatif, écran de confirmation (« Le client sera remboursé de X €. Les frais Stripe ne sont pas
   rendus. »), puis statut « Remboursé » ou « Remboursé partiellement ».
2. Côté serveur : `companyId` via `requireCompanyMember()` ; le paiement est re-vérifié comme appartenant au tenant ; montants en centimes ; appel
   Stripe avec `idempotencyKey` ; selon le type de paiement réellement utilisé dans le code (à vérifier à l'audit) : paiement par destination →
   `reverse_transfer: true` (argent repris au detailer) et `refund_application_fee: true` ; paiement direct sur le compte du detailer → remboursement
   sur ce compte (`stripeAccount`). Aucun effet en base avant la réussite Stripe ; le webhook `charge.refunded` met à jour le statut (signature
   vérifiée, idempotent).
3. Carte cadeau : un remboursement (total ou partiel) désactive la carte (règle L74).
4. Si le solde du compte du detailer est insuffisant : message clair en une phrase (« Remboursement impossible pour l'instant : le solde de votre
   compte de paiement est insuffisant. Réessayez après votre prochain encaissement. »), rien n'est modifié.
5. Tests : remboursement total et partiel, dépassement refusé, double clic (idempotence), webhook rejoué, tenant B ne peut pas rembourser un paiement
   du tenant A, carte cadeau désactivée, solde insuffisant.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
