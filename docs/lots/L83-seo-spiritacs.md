# L83 — SEO spiritacs.com : logo Google (favicon, manifest, JSON-LD), zone desservie, textes trop longs

**Accord de Clément requis avant de lancer** (site client Spirit ACS). Ne touche ni aux prix, ni au calcul de réservation, ni à Cleanyzer. Vérifier le domaine spiritacs.com séparément après le lot (leçon du 2026-11-19 : sitemaps Spirit affichant des adresses Cleanyzer).

## Objectif
Corentin signale que son logo ne s'affiche pas dans Google. Constats (25/11/2026, site en ligne) :
- `https://www.spiritacs.com/favicon.ico` → **404** (page d'erreur DetailFlow). `<link rel="icon">` et `apple-touch-icon` pointent bien vers `/custom-sites/spirit-acs/icon.png` (PNG 480×480, 165 Ko, logo complet très détaillé).
- La page d'accueil Spirit expose encore des éléments **DetailFlow** : `<link rel="manifest" href="/manifest.webmanifest">` (nom « DetailFlow », icônes `/icons/icon-192.png`…), `application-name`, `apple-mobile-web-app-title`, `author`, `creator`, `keywords` (logiciel de gestion detailing…), `generator v0.app`.
- Le JSON-LD `AutoWash` n'a **aucune propriété `logo`** (le tenant n'a pas de `logoUrl` en base) ni `areaServed`, `hasMap`, `@id`.
- Description de l'accueil beaucoup trop longue (> 200 caractères, cible 140-160) ; titre de `/prestations/nettoyage-automobile` à 77 caractères (cible ≤ 60). Les autres titres (45-53) sont corrects.
- Sitemap : `lastmod` = date du jour sur toutes les pages (valeur non réelle) ; canonique de l'accueil sans `/` final alors que le sitemap l'a.
- Une seule ville (Lagny-sur-Marne) dans tout le site ; aucune commune voisine.

## À faire
Pour Spirit ACS uniquement (`seo.isSpirit` / `customSiteKey = "spirit-acs"`), sans changer le comportement des autres tenants :
1. **`/favicon.ico` Spirit** : le fichier est exclu du middleware (`middleware.ts`, matcher) et tombe sur la route `[localSlug]` → 404. Ajouter une route (ex. `app/favicon.ico/route.ts`) qui, selon l'hôte, renvoie l'icône du tenant (Spirit : `public/custom-sites/spirit-acs/icon.png`) et garde l'icône DetailFlow pour detailflow.fr. Aucune règle d'autopilot ni hook modifiés.
2. **Icône carrée lisible** : prévoir un `icon.png` Spirit simplifié (multiple de 48 px : 192×192 minimum) à la place du logo complet. **Fichier à fournir par Corentin** ; en attendant, garder l'actuel. Mettre la même image pour `icon` et `apple` (`CUSTOM_SITE_SHARE_ASSETS` dans `lib/seo/tenant-seo.server.ts`).
3. **Manifest et balises DetailFlow sur le site Spirit** : dans `app/layout.tsx` (`metadata`) et `app/manifest.ts`, ne plus émettre manifest, `applicationName`, `appleWebApp.title`, `authors`/`creator`, `keywords`, `generator` DetailFlow sur les pages d'un tenant à site personnalisé : surcharger dans `buildTenantMetadata` / `buildTenantPageMetadata` (`lib/seo/tenant-metadata.ts`) avec le nom et l'icône du tenant. Le manifest DetailFlow reste pour l'admin et detailflow.fr.
4. **JSON-LD `logo`** : dans `buildTenantLocalBusiness` (`lib/seo/tenant-seo.server.ts`, calcul de `logoAbsolute`), pour Spirit sans `logoUrl`, utiliser une URL absolue de fichier réel (`/custom-sites/spirit-acs/icon.png` ou `spirit-logo.png`) sur le domaine du tenant. Ne rien inventer pour les autres tenants.
5. **Zone desservie** : passer `areaServed` pour Spirit dans `app/(site)/layout.tsx` (comme `CLZ_AREA_SERVED` pour Cleanyzer) avec **uniquement** les communes confirmées par Corentin (à demander ; ne pas deviner les communes voisines). Ajouter `withStableId: true` si cela ne casse pas `tests/spirit-acs-seo.test.ts`. Pas de `aggregateRating` tant que la note n'est pas réelle et affichée.
6. **Textes trop longs** dans `components/custom-sites/spirit-acs/seo-content.ts` (`SPIRIT_PAGE_META`) : description de l'accueil à 140-160 caractères avec appel à l'action ; titre de `nettoyage-automobile` ≤ 60 caractères (ex. « Nettoyage auto à Lagny-sur-Marne | Spirit ACS »). Ramener aussi les descriptions de prestations > 160 caractères (nettoyage-automobile 171, protection-ceramique 167).
7. **Sitemap** (`app/sitemap.ts`) : remplacer `lastmod` = maintenant par une vraie date (ou l'omettre). Aligner la canonique de l'accueil et l'URL du sitemap (avec ou sans `/` final, un seul choix).
8. **Pages par commune** : hors de ce lot tant que la liste des communes n'est pas fournie ; à planifier dans un lot suivant avec contenu propre par ville.

Fichiers probables (à confirmer par le plan) : `app/layout.tsx`, `app/manifest.ts`, `app/favicon.ico/route.ts` (nouveau), `middleware.ts`, `app/(site)/layout.tsx`, `lib/seo/tenant-seo.server.ts`, `lib/seo/tenant-metadata.ts`, `components/custom-sites/spirit-acs/seo-content.ts`, `app/sitemap.ts`, `tests/spirit-acs-seo.test.ts`.

Hors code (dans le rapport client) : fiche Google, avis, photos, demande de ré-exploration dans la Search Console, URL Instagram avec paramètre de suivi (`?igsi=`) à nettoyer dans l'admin du tenant.

## Vérification
- `curl -I https://www.spiritacs.com/favicon.ico` → 200, `image/*`, et même image que `<link rel="icon">`. Sur detailflow.fr : icône DetailFlow inchangée.
- Source de l'accueil Spirit : plus aucun « DetailFlow » (manifest, application-name, apple-mobile-web-app-title, author, keywords) ; admin et detailflow.fr inchangés.
- JSON-LD de l'accueil : présence de `logo` (URL absolue qui répond 200) et `areaServed` avec les seules communes validées ; test Rich Results sans erreur.
- Longueur des titres ≤ 60 et des descriptions 140-160 sur les 9 pages du sitemap ; `lastmod` non uniforme.
- Tests : `tests/spirit-acs-seo.test.ts`, `tests/cleanyzer-seo.test.ts`, `tests/l61-sitemap-domaine.test.ts` passent ; sitemaps Cleanyzer et Spirit vérifiés séparément ; aperçu visuel inutile (aucun changement d'affichage hors icône).
- Après mise en ligne : Corentin demande la ré-exploration de l'accueil dans la Search Console ; délai de prise en compte par Google : quelques jours à quelques semaines.
