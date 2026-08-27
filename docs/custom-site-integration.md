# Sites publics entièrement personnalisés

Ce socle permet à certaines entreprises d'avoir un site public **entièrement
personnalisé** (design + structure propres), tout en réutilisant les routes et
les modules métier existants de DetailFlow.

Ce n'est **ni un template, ni un thème, ni un builder** : chaque site
personnalisé a sa propre identité visuelle et son propre shell.

## Pièces du socle

- `lib/db/schema.ts` — colonne `companies.customSiteKey` (TEXT nullable).
- `scripts/custom-site-key-migration.sql` — migration additive (non exécutée).
- `lib/custom-sites/types.ts` — `CustomSiteDefinition`, `CustomSitePublicData`.
- `lib/custom-sites/registry.ts` — `customSiteRegistry` + validation des clés.
- `lib/custom-sites/server.ts` — résolution du site du tenant + contrat public.
- Dispatch public : `app/(site)/page.tsx` (contenu) et `app/(site)/layout.tsx`
  (shell propre si `ownShell`).
- Super-admin : action `setCustomSiteKeyAction` + affichage dans la carte.

## Comportement

- `customSiteKey = NULL` → **site standard exact** (comportement historique).
- Clé **enregistrée** → rendu du site personnalisé correspondant.
- Clé **inconnue** → journalisation sobre côté serveur + **repli** sur le site
  standard (jamais de crash en production).
- Le tracking, les gardes communes et la licence `website` restent actifs.
- Un `customSiteKey` n'est **jamais** attribué automatiquement : uniquement via
  l'action super-admin, qui valide la clé contre le registre côté serveur.

## Ajouter un futur site personnalisé

1. **Créer son dossier dédié**, par ex. `components/custom-sites/spirit-acs/`.
   Exemples futurs : `components/custom-sites/cleanyzer/`,
   `components/custom-sites/autre-client/`. Chaque dossier peut avoir une
   identité visuelle totalement différente.
2. **Définir son composant et son shell propres** : un composant serveur
   `Page` de type `ComponentType<{ data: CustomSitePublicData }>`. S'il gère
   sa propre navigation/pied de page, mettre `ownShell: true`.
3. **L'enregistrer dans le registre** (`lib/custom-sites/registry.ts`) en
   ajoutant une entrée `"<clé>": { key, name, ownShell, Page }` où `key` est
   identique à la clé de l'objet.
4. **Utiliser le contrat public** `CustomSitePublicData` (loaders paresseux :
   `getContact`, `getHours`, `getServices`, `getReviews`, `getGallery`,
   `getContent`, `getCustomRequestsConfig`). Ne charger que ce que la route
   affiche réellement.
5. **Réutiliser les routes et modules métier existants** (réservation, prix,
   paiement…) — ne rien réimplémenter.
6. **Ne jamais copier le design Spirit par défaut** : chaque site est unique.
7. **Ne jamais dupliquer** les moteurs de réservation, de prix, de paiement ou
   de sécurité.

## Interdits pour un composant de site personnalisé

Un site personnalisé ne doit **jamais** :

- importer `db` ni interroger directement Drizzle ;
- recevoir un `companyId` du navigateur ;
- recalculer un prix ;
- déterminer une disponibilité ;
- créer une réservation ;
- appeler Stripe.

Il consomme uniquement `CustomSitePublicData` et réutilise les routes métier
existantes.

## Attribuer une clé (super-admin)

L'action `setCustomSiteKeyAction(companyId, key)` :

- est protégée par `requireSuperAdmin` ;
- refuse toute clé non enregistrée (aucune écriture) ;
- accepte `null`/vide pour rétablir le site standard ;
- ne modifie que la colonne `customSiteKey` (additif, réversible).
