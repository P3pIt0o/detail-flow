# L122 — Choisir l'ordre des prestations sur la page de réservation

Risque : faible (affichage et une action admin qui met à jour `sortOrder`, colonne déjà existante ; aucune migration, aucun paiement).
Demande d'un client (Thimawash, 28/11) : « peut-on classer les prestations, par exemple choisir celle qui arrive en premier, le plus haut dans la page ? »
La colonne `services.sortOrder` existe et la page publique trie déjà dessus (`lib/admin/catalog-queries.ts`), mais aucun écran ne permet de la changer.
L108 prévoit aussi « ordre des prestations » : L108 réutilisera ce que fait L122 (ne pas le recoder).

## Ce qu'il faut faire
1. Page admin « Prestations » (`app/admin/(dashboard)/prestations`) : sur chaque ligne, deux boutons « Monter » / « Descendre » (cibles ≥ 44 px,
   libellés accessibles), même modèle que la galerie (`components/admin/settings/gallery-settings.tsx`, `reorderGalleryItems`). Retour immédiat
   (état local, optimiste), puis enregistrement.
2. Action serveur `reorderServices(ids)` : `companyId` UNIQUEMENT via `requireCompanyMember()` ; vérifier que CHAQUE id appartient à l'entreprise
   (sinon refus, rien n'est modifié) ; mise à jour de `sortOrder` = position, filtrée par `companyId`, en une transaction.
3. Les nouvelles prestations arrivent en dernier (`sortOrder` = max + 1).
4. Même chose pour les catégories de prestations si la page de réservation les affiche par catégorie (`serviceCategories.sortOrder`).
5. Texte d'aide d'une ligne : « L'ordre ici est celui de votre page de réservation. »

## Tests
Ordre appliqué sur la page publique ; ids d'une autre entreprise refusés (le tenant B ne réordonne pas les prestations du tenant A) ; nouvelle
prestation en dernier ; liste avec un seul élément ; boutons désactivés aux extrémités.
Aperçu (téléphone) de la page Prestations avec les boutons.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
