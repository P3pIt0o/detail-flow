# L36 — Formules d'abonnement : description de retour + regroupement par catégorie de véhicule

Risque : CRITIQUE (nouvelle migration `scripts/*.sql`). Branche partie de `main`. Demandé par JustClean (Juliette) et
Sylnet Auto (Sylvain). Aperçu validé par Clément le 03/11/2026 (artifact « Formules regroupées L36 »).

## Constat (relevé le 03/11/2026 sur `main`)

- `maintenance_plans.description` existe, est validée (`plan-validation.ts`, 2 000 car.) et affichée par
  `components/subscriptions/public-plans.tsx`. Elle est éditable dans `plan-configurator.tsx` (anciennes formules)
  mais **absente de `plan-wizard.tsx`**, utilisé pour toutes les nouvelles formules depuis L27 : les pros ne peuvent plus
  la saisir. `plan-form.ts` (forme wizard) contient déjà `description`.
- Une formule a un seul prix. Les pros qui facturent selon le véhicule créent donc une formule par catégorie
  (ex. 3 formules × 4 catégories = 12 cartes sur la page publique).
- `maintenance_plans` n'a aucun lien avec `vehicle_types`.

## Décisions (tranchées, Clément 03/11/2026)

- [x] **Description** : champ « Description (facultatif) » ajouté dans `plan-wizard.tsx`, même libellé, aide et limite que
  dans `plan-configurator.tsx`. Création et modification. Aucun changement de modèle.
- [x] **Catégorie de véhicule** : nouvelle colonne nullable `maintenance_plans."vehicleTypeId"` (integer), migration
  additive et idempotente `scripts/maintenance-plans-vehicle-type-migration.sql`. Champ facultatif dans le wizard
  (« Toutes les catégories » = null), liste = `vehicle_types` du tenant.
- [x] **Sécurité tenant** : `vehicleTypeId` reçu du client est re-vérifié comme appartenant au `companyId` de
  `requireCompanyMember()` / `requireAdminCompanyId()` ; sinon erreur de validation. Test « tenant B ne peut pas
  rattacher une formule à une catégorie du tenant A ».
- [x] **Regroupement (affichage public uniquement)** : les formules publiques du même tenant ayant le même nom
  (comparaison sans casse ni espaces superflus) ET une `vehicleTypeId` non nulle forment un groupe = une carte.
  Dans la carte : description, sélecteur de catégorie (ordre de `vehicle_types`), prix et lignes de la formule
  sélectionnée. Le bouton / le formulaire de demande utilise l'`id` de la formule sélectionnée (aucun changement côté
  demande, paiement ou Stripe). Le choix de catégorie est partagé entre les cartes.
- [x] Une formule sans catégorie, ou seule de son nom, s'affiche exactement comme aujourd'hui.
- [x] Si deux formules d'un même groupe ont des descriptions différentes : on affiche celle de la formule sélectionnée.
- [x] Tolérance migration non appliquée : si la colonne n'existe pas encore, lecture/écriture sans planter (même approche
  que `lib/services/highlight-store.ts`) ; le regroupement est simplement inactif.
- [x] Hors périmètre : prix, commissions, Stripe, abonnés existants, emails. Aucun texte de vente inventé.

## À établir pendant l'AUDIT

- Ordre actuel des formules dans `public-offer.ts` ; position d'un groupe = position de sa première formule.
- Tous les endroits qui rendent `PublicPlans` (site standard, `/formules`, sites personnalisés Spirit / Cleanyzer…).
- Si la régression de la description vient bien de L27 (à noter dans le rapport).

## Critères d'acceptation

- [ ] C1 Description saisissable dans le wizard (création + modification), enregistrée, affichée sur la page publique.
- [ ] C2 3 noms × 4 catégories → 3 cartes ; changer de catégorie met à jour prix et lignes ; la demande part avec l'id
  de la bonne formule (tests unitaires de la fonction de regroupement + test du composant).
- [ ] C3 Formules sans catégorie : rendu identique à avant (test).
- [ ] C4 Test multi-tenant sur `vehicleTypeId` (C. Sécurité tenant).
- [ ] C5 Migration additive, idempotente, en-tête commenté ; non exécutée par l'agent.
- [ ] C6 Le nombre de tests en échec et d'erreurs TypeScript n'augmente pas (CI L34 verte).

## Aperçu : artifact « Formules regroupées L36 » (validé).

## À faire par Clément après la fusion

Appliquer `scripts/maintenance-plans-vehicle-type-migration.sql` sur la base de prod, puis prévenir Juliette et Sylvain.
