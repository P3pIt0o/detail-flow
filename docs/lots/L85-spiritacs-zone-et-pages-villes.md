# L85 — spiritacs.com : zone d'intervention réelle, pages par ville, prix « dès » dans Google

Site client Spirit ACS (`customSiteKey = "spirit-acs"`). Lot délégué par Clément (feu vert) : à relire avant de fusionner.
Ne touche ni au calcul de réservation, ni aux prix eux-mêmes, ni à Cleanyzer ni aux autres tenants. Suite directe de L83 (point 8).

## Données confirmées par Corentin (26/11/2026)
Nom affiché partout : **« Spirit ACS »** (inchangé). `alternateName` du JSON-LD : « Spirit Auto Clean Service » (déjà fait en L83) et « spiritacs ».
Communes où il intervient vraiment (orthographe officielle, à utiliser telle quelle) :
Lagny-sur-Marne (ville de base), Chelles, Jossigny, Serris, Crécy-la-Chapelle, Jablines, Collégien, Villevaudé, Pomponne,
Saint-Thibault-des-Vignes, Gouvernes, Conches-sur-Gondoire, Montévrain, Bussy-Saint-Georges.
« Marne-la-Vallée » n'est pas une commune : la citer seulement dans les textes (« secteur de Marne-la-Vallée »), jamais comme page ni dans `areaServed`.

## À faire
1. **Zone d'intervention** : une seule source de vérité, `SPIRIT_CITIES` (dans `components/custom-sites/spirit-acs/seo-content.ts`), avec les 14 communes ci-dessus.
   L'utiliser pour la section `SpiritZone` (prop `cities`) et pour `areaServed` du JSON-LD Spirit (`app/(site)/layout.tsx`, comme `CLZ_AREA_SERVED`), type `City` avec `name`.
2. **Pages par ville, sans pages « copier-coller »** (Google pénalise les pages identiques qui ne changent que le nom de la ville) :
   - une page **« Zone d'intervention »** `/zone-intervention` : les 14 communes, le principe (déplacement à domicile ou au travail), les prestations et leurs prix « dès », lien vers la réservation ;
   - des pages dédiées **uniquement pour les 5 plus grandes communes** : Chelles, Bussy-Saint-Georges, Serris, Montévrain, Saint-Thibault-des-Vignes, en `/detailing/<commune>` (ex. `/detailing/chelles`).
     Lagny-sur-Marne reste la page d'accueil (pas de doublon).
   - chaque page ville : titre ≤ 60 caractères (« Detailing à Chelles à domicile | Spirit ACS »), description 140-160 caractères, un H1 propre, un paragraphe d'introduction
     différent par ville, les prestations avec leurs prix « dès » existants, les communes voisines de la liste (liens internes), la FAQ existante, bouton de réservation.
   - **Aucune information locale inventée** (pas de faux quartiers, distances, temps de trajet, clients ou avis par ville). Le texte de chaque ville se différencie par la
     formulation et les communes voisines de la liste, rien d'autre.
   - ajout au sitemap Spirit (et seulement au sien), canonique propre, liens depuis la section zone et le pied de page.
3. **Prix « dès » dans Google** : dans le JSON-LD des pages prestation Spirit, ajouter `offers` (`Offer` avec `priceSpecification` `minPrice`, `priceCurrency: "EUR"`)
   **uniquement** pour les formules `priceKind: "from"` ou `"exact"` déjà présentes dans `seo-content.ts` (montants en centimes déjà validés). Rien pour `"quote"` (PPF, devis).
   Reprendre les montants du code, ne jamais en écrire de nouveaux. Pas d'`aggregateRating` (non affiché sur le site).
4. Tests : `tests/spirit-acs-seo.test.ts` étendu — 14 communes dans `areaServed`, 6 nouvelles URL dans le sitemap Spirit et aucune dans celui de Cleanyzer ni de detailflow.fr,
   titres ≤ 60 / descriptions ≤ 160, `offers` absent pour les prestations sur devis, contenu des 5 pages ville différent deux à deux. `tests/cleanyzer-seo.test.ts` et
   `tests/l61-sitemap-domaine.test.ts` passent.

## Aperçu
Aperçu `.lot-state/L85.apercu.html` : la page Zone d'intervention et une page ville (mobile), même charte que le site Spirit actuel (navy, cyan).

## Hors code (pour Clément, à transmettre à Corentin)
Ajouter ces mêmes communes comme « zone desservie » dans sa fiche Google ; demander l'indexation des nouvelles pages dans la Search Console après mise en ligne.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
