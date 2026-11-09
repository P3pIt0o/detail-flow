# L45 — Carte digitale du detailer (page carte + contact + QR code + couleurs)

Risque : NORMAL visé (page publique en lecture, réglages dans `companies.siteContent`, aucune migration, aucun paiement).
Branche partie de `main`. Fait AVANT L46 (fidélité), qui réutilise la carte 3D et les couleurs.

## Objectif
Chaque detailer a une carte de visite digitale à partager (QR code, bio Instagram, autocollant), reliée à DetailFlow.

## Décisions (Clément, 09/11/2026)
- [x] Route publique `/carte` du tenant (même résolution de tenant que les autres pages publiques : domaine perso, sous-domaine,
  `?tenant=` en Preview). Disponible pour TOUS les plans (outil d'acquisition), activable/désactivable par le pro (activée par défaut).
- [x] Contenu : logo, nom, ligne d'activité/zone (données existantes du tenant), boutons « Réserver » (lien de réservation existant),
  « Appeler » (`tel:`), « WhatsApp » (`wa.me`, si numéro mobile), « Itinéraire » (si adresse publique), « Avis Google » (si lien
  d'avis renseigné), « Enregistrer le contact » (fichier vCard `.vcf` généré côté serveur : nom, téléphone, e-mail, site, adresse
  si publique). Un bouton dont la donnée manque est masqué (jamais de lien vide).
- [x] **Carte 3D** : la carte (logo + nom + couleurs) s'incline selon l'orientation du téléphone (`deviceorientation`), avec reflet
  lumineux qui suit l'inclinaison. iOS : demande d'autorisation au premier toucher (« Toucher pour animer la carte ») ;
  ordinateur : inclinaison au survol de la souris ; `prefers-reduced-motion` ou refus : carte fixe. Aucune librairie lourde
  (CSS transform + petit composant client), 60 i/s, pas de layout shift.
- [x] **Couleurs réglables** dans l'admin : nouvel onglet « Carte digitale » (catégorie « Site public », ET visible en mode widget
  `booking_only` comme L44) : couleur de fond, couleur d'accent, style (uni / dégradé), aperçu en direct de la carte 3D,
  activation. Stockage : `siteContent.digitalCard` (fusion `{...existing}`, même modèle que L39 : `select … for update`,
  `requireCompanyMember`, validation hex `#RRGGBB`, contraste texte calculé automatiquement blanc/noir).
- [x] Admin : bouton « Télécharger mon QR code » (PNG haute définition + SVG) pointant vers `/carte`, et « Copier le lien ».
- [x] SEO : `noindex` sur `/carte` (page de partage, évite le contenu dupliqué avec le site).
- [x] Spirit ACS et sites 100 % personnalisés : la route fonctionne aussi (aucun réglage masqué pour l'onglet Carte digitale).
- [x] Aucun texte de vente nouveau en dehors des libellés listés.

## Critères d'acceptation
- [ ] C1 `/carte` du tenant A n'affiche que les données de A ; tenant inconnu/suspendu → 404 (test).
- [ ] C2 vCard valide (champs échappés, CRLF, UTF-8) ; boutons masqués si donnée absente (test).
- [ ] C3 Réglages : validation hex, fusion `siteContent` sans écraser les autres clés, B ne peut pas modifier A (test PGlite).
- [ ] C4 Carte fixe si `prefers-reduced-motion` (test du composant) ; captures 390 px dans le rapport.
- [ ] C5 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant.
