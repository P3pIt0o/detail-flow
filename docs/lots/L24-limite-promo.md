# L24 — Limite de débit sur les codes promo, et affichage du récapitulatif

Risque : **critique** (réservation publique, anti-abus). Base : `main` après L23.

## Problème
- `validatePromoCodeAction`, ainsi que `getQuoteAction` quand un code est fourni, vérifient des codes promo sans
  aucune limite de débit : un tiers peut deviner des codes. Seul `createBookingAction` est limité (règle
  `booking-create`).
- Affichage :
  - l'économie annoncée par une suggestion utilise `basePriceCents` quand il n'y a pas de prix pour le type de
    véhicule ;
  - le code affiché est `code.toUpperCase()` et non le code normalisé par le serveur.

## Décisions (propriétaire, 21/10)
- **A. Règle Vercel Firewall distincte `booking-promo`**, avec le même mécanisme que `isBookingRateLimited`
  (`@vercel/firewall`, `checkRateLimit`). Elle s'applique :
  - à `validatePromoCodeAction` ;
  - à `getQuoteAction` **uniquement quand un code est fourni**, jamais sur un simple recalcul du panier.
- **B. Limite indisponible** (règle absente, erreur, service injoignable) : **on laisse passer**, y compris en
  production. C'est volontairement différent de `booking-create`, qui bloque dans ce cas.
- **C. Tests de `tests/launch-lot1-hardened.test.ts`** :
  - le test « n'est pas rate-limité » est restreint à `getAvailabilityAction`, `getAvailabilityRangeAction` et
    `computeTravelAction` ;
  - des tests positifs sont ajoutés pour `validatePromoCodeAction` et pour `getQuoteAction` avec code ;
  - un test vérifie que `getQuoteAction` sans code n'est pas limité.
- **Limite atteinte** :
  - `validatePromoCodeAction` : refus avec un message générique (sans quota, IP ni fournisseur) ;
  - `getQuoteAction` avec code : le prix est calculé sans code, et le code est annoncé « non vérifié, réessayez
    dans un instant ». Le devis n'est pas bloqué.
- **Affichage** :
  - l'économie des suggestions est calculée au prix du type de véhicule ;
  - le code affiché est `normalizedCode`.
- **Seuil et création de la règle dans Vercel Firewall** : faits à la main par le propriétaire, hors code.
