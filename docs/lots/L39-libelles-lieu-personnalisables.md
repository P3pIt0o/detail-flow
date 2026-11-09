# L39 — Libellés personnalisables des lieux de prestation (« Chez vous » / « À l'atelier »)

Risque : MOYEN (UI admin + page de réservation publique, aucune migration). Branche partie de `main`.
Demandé par AutoCare (auto.care83) le 06/11/2026 : remplacer « à domicile / chez vous » par « service clé en main ».

## Constat (main, 07/11/2026)
- Réservation publique : `components/booking-v2/step-datetime.tsx` l. ~181-194, textes en dur :
  « Chez vous » / « Le professionnel vient à votre adresse. » et « À l'atelier » / « Vous vous rendez directement à l'atelier. »
- Réglages : `components/admin/settings/location-settings.tsx` (Paramètres › Réservations › Lieu).
- Stockage disponible sans migration : `companies.siteContent` (jsonb), déjà utilisé pour d'autres textes (ex. `customRequests`).

## Décisions (Clément, 07/11/2026)
- [x] Dans Paramètres › Réservations › Lieu, sous chaque mode activé, deux champs facultatifs :
  « Titre affiché aux clients » (40 car. max) et « Description » (90 car. max). Placeholder = texte actuel.
- [x] Stockage : `companies.siteContent.locationLabels = { client?: {title, text}, workshop?: {title, text} }`.
  Champ vide → texte par défaut actuel (aucun changement pour les autres pros).
- [x] Affichage : `step-datetime.tsx` utilise ces libellés s'ils existent. Texte brut uniquement (pas de HTML), espaces
  rognés, longueur bornée côté serveur.
- [x] Sécurité tenant : écriture via l'action serveur existante des réglages, `companyId` de `requireCompanyMember()`
  uniquement ; lecture publique via le tenant résolu. Test « le tenant B ne modifie pas les libellés du tenant A ».
- [x] Hors périmètre : emails, factures, sites sur mesure (Cleanyzer, Spirit, Rozan…), calcul du déplacement.

## Critères d'acceptation
- [ ] C1 Libellés saisis → affichés sur la réservation du tenant ; vides → textes actuels (tests).
- [ ] C2 Validation serveur : longueurs max, texte brut, valeurs inconnues ignorées (tests).
- [ ] C3 Test multi-tenant (écriture).
- [ ] C4 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant (CI verte).

## Aperçu : capture de l'écran Lieu avec les 2 champs + capture de l'étape réservation (AutoCare : « Service clé en main »).

## Après fusion
Renseigner pour AutoCare (ou le laisser faire) : Titre « Service clé en main », description à valider avec lui.
