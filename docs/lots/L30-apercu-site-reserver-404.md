# L30 — Bouton « Réserver » en 404 depuis l'aperçu de la page publique

Risque : MOYEN (navigation publique d'un tenant, aucun paiement, aucune migration). Branche partie de `main` après la fusion de L29.

## Constat (Clément, 25/10/2026, sur mobile, tenant réel)

1. Admin › menu « Plus » › **Page publique** (Paramètres de la page publique, avec aperçu Desktop / Mobile).
2. Dans le bloc d'aperçu, bouton **« Ouvrir »** → le site du tenant s'ouvre (hero, bouton « Réserver », « Voir les prestations »).
3. Clic sur **« Réserver »** → **Erreur 404 « Page introuvable »**.
4. Le même site ouvert par son adresse normale `detailflow.fr/?tenant=<slug>` → « Réserver » fonctionne.

Hypothèse à vérifier (ne pas la tenir pour acquise) : « Ouvrir » ouvre `/p/<slug>` (chemin réservé à l'embed et à l'aperçu interne selon `lib/public-site-links.ts` et `lib/admin/public-link.ts`), et le lien « Réserver » produit depuis ce contexte perd le tenant ou vise une route inexistante.

## Décisions (tranchées)

- [x] Tout bouton de l'admin qui ouvre le site public dans un nouvel onglet (« Ouvrir » de l'aperçu, « Voir mon site », « Ouvrir mon site », lien copié) ouvre l'adresse publique canonique, celle que reçoivent les clients — jamais un chemin technique.
- [x] Un visiteur qui arrive sur `/p/<slug>` (ancien lien partagé) ne doit jamais tomber sur une 404 en cliquant sur « Réserver », « Voir les prestations », « Formules » ou tout lien interne : soit les liens conservent le tenant, soit `/p/<slug>` redirige vers l'adresse canonique. L'agent choisit la solution la plus simple et l'explique dans le plan.
- [x] L'iframe d'aperçu dans l'admin continue de fonctionner (Desktop / Mobile, rafraîchir).
- [x] Aucun changement de textes, d'apparence, de prix ou de comportement de réservation.

## À établir pendant l'AUDIT

- URL exacte ouverte par « Ouvrir » et URL exacte produite par « Réserver » depuis cette page (et pour chaque lien interne du site).
- Liste de tous les endroits de l'admin qui ouvrent ou copient l'adresse du site public, avec l'URL produite.
- Comportement pour un site standard, un domaine personnalisé et un site sur mesure (`customSiteKey` : spirit-acs, cleanyzer, rozan) : aucun ne doit régresser.

## Critères d'acceptation

- [ ] R1 Depuis l'aperçu « Ouvrir », « Réserver » ouvre le parcours de réservation du bon tenant (test de rendu ou test de liens).
- [ ] R2 `/p/<slug>` puis chaque lien interne (Réserver, Voir les prestations, Formules, Contact, Avis) → jamais de 404, toujours le même tenant.
- [ ] R3 Tous les boutons admin listés à l'audit produisent l'adresse canonique ; aucun ne produit `/p/<slug>` hors embed / iframe d'aperçu.
- [ ] R4 Isolation : un lien construit pour le tenant A ne peut jamais afficher le tenant B (slug pris côté serveur, jamais depuis un paramètre navigateur non vérifié).
- [ ] R5 Embed `?embed=1` et iframe d'aperçu inchangés.
- [ ] R6 Sites sur mesure et domaines personnalisés : liens inchangés et fonctionnels.
- [ ] R7 Le nombre de tests en échec et d'erreurs TypeScript n'augmente pas par rapport à la baseline.

## Aperçu : sans objet — correction de liens, aucun changement visible hormis la disparition de la 404.

## Test manuel (Clément, sur la Preview puis en production)

Sur mobile : Admin › Page publique › Ouvrir › Réserver → parcours de réservation. Idem avec « Voir mon site » dans le menu. Idem en collant `/p/<slug>` dans une fenêtre privée.
