# L20 — Promotions appliquées à la réservation (ex-« L17-D »)

Risque : **critique** (`lib/promo/service.ts`, `lib/invoice/actions.ts`, montant facturé). Plan approuvé : `.lot-state/L20.plan.md`.

## Ce qui change
- `createBookingAction` applique les offres et équivalences actives du tenant (stockage L19, moteur L17-B inchangé) :
  - montant, acompte et durée calculés sur le panier normalisé ;
  - `discountCents` = remise totale (code + offres) ;
  - instantané figé dans `bookings.promotionSnapshot` (si la migration L19 est appliquée).
- Code promo arbitré par le moteur. Sans permission de cumul, le client garde la remise la plus avantageuse. Un code écarté n'est **ni appliqué ni consommé** :
  - l'aperçu (`validatePromoCodeAction`) répond `not_combinable` ;
  - à la création, la réservation est refusée avec le motif : jamais un montant différent de celui annoncé.
- Code en **pourcentage** : recalculé sur le montant réellement facturé (panier normalisé, après les offres cumulables, prestations visées seulement). Code fixe : montant validé, plafonné au reste.
- **Une ligne = un véhicule**, avec une clé tirée du rang de la ligne et jamais de l'identifiant envoyé par le navigateur : un client ne peut pas fusionner deux voitures pour faire disparaître une prestation.
- Même traitement deux fois sur un véhicule : facturé une seule fois, jamais de refus. La forme la moins chère est gardée, sauf si elle laisserait une option sans prestation (la prestation est alors gardée).
- `getQuoteAction` renvoie en plus un aperçu `promotions` (montant réel annoncé, utilisé par L17-E).
- Facture créée depuis une réservation : reprend la remise réelle, appliquée avant la TVA, sans jamais toucher au déplacement (D-L20-2).
- Correctifs de la revue L19 :
  - **A1/A2** : périmètre malformé → offre rejetée ;
  - **A3** : erreur de requête → cache de schéma réinitialisé ;
  - **A6** : instantané écrit seulement si les colonnes existent ;
  - **A7** : objets reconstruits ;
  - équivalences et compléments créés désactivés ;
  - modification sans réécriture de `active` ;
  - éléments revérifiés à l'activation ;
  - limites : 120 caractères, 10 paliers, 5 compléments, entiers sûrs ;
  - message neutre avant migration.

## Inchangé (garanti par les tests)
- **Sans offre ni équivalence** : montants, lignes et code promo strictement identiques à avant L20.
- **Migration non appliquée** : aucune offre, aucune écriture d'instantané.
- **Spirit ACS / Rozan** : aucune offre.
- **Base de promotions en erreur alors que les tables existent** : réservation refusée avec un message neutre, rien n'est écrit.
- Capacité journalière, paiements, Stripe, commissions, e-mails, interface : non modifiés.

## Pour L17-E (panier Booking V2)
- Afficher le motif `not_combinable` dans le panier (aujourd'hui : message générique de l'interface ; la création, elle, renvoie le motif exact).
- Plusieurs prestations sur un même véhicule : exiger une identité de véhicule contrôlée côté serveur avant de regrouper des lignes.

## À savoir
Une facture créée depuis une réservation traite les prix des lignes comme **hors taxes** quand la TVA est activée (convention existante de `computeInvoice`, inchangée). La remise suit cette même base.

## Mise en service (manuelle, hors agent)
1. Appliquer `scripts/l19-promotions-migration.sql` sur la branche Neon `dev`, avec `PGOPTIONS='-c lock_timeout=5s'`.
2. Créer une offre de test désactivée, l'activer, réserver, vérifier montant, acompte, instantané et facture.
3. Production : uniquement sur accord explicite.
