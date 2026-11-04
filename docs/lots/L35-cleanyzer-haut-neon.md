# L35 — Cleanyzer : nouveau haut de page néon, conversion et SEO local

Risque : NORMAL (site personnalisé Cleanyzer uniquement, aucune migration, aucun paiement). Branche partie de `main`.
Maquette validée par Tom le 04/11/2026 : `docs/lots/L35.apercu.html` (référence visuelle à suivre fidèlement ;
les sections « Tarifs » et « Réservation » de démo de la maquette n'existent pas : on utilise celles du site).
Médias : `public/custom-sites/cleanyzer/neon/` (fournis, déjà optimisés).

## Périmètre

Uniquement `components/custom-sites/cleanyzer/**`, `app/cleanyzer-preview/**`, `public/custom-sites/cleanyzer/neon/**`
et leurs tests. Aucun autre tenant ni site (Spirit, Rozan, site standard) ne change.

## Décisions (tranchées, Clément + Tom, 03–04/11/2026)

### Haut de page (`hero.tsx`)
- [x] Fond : deux `<video>` superposées. `hero-arrivee` joue une fois, puis `hero-boucle` (déjà chargée, arrêtée sur sa
  1re image = dernière image de l'arrivée) démarre et l'arrivée se masque : aucun écran noir. 720p si largeur ≤ 760 px,
  1080p sinon. `muted playsinline`, poster `.webp`. `prefers-reduced-motion` : boucle arrêtée sur son poster.
- [x] Le poster est l'image LCP (`fetchpriority="high"`), les vidéos se chargent après.
- [x] Textes : « CLEANYZER », slogan « La propreté à l'état pur » (toujours visible), puis **H1 unique** :
  « Nettoyage auto & detailing à domicile, à Annecy et alentours ».
- [x] Desktop : boutons « Réserver mon nettoyage » (ouvre directement la réservation BookingV2) et « Voir les tarifs »
  (ancre vers la section Prestations & tarifs EXISTANTE). Mobile (≤ 760 px) : ces boutons sont masqués.
- [x] Sous la ligne des métiers (Nettoyage auto · Detailing · Matelas · Canapés · Tapis & moquettes) : petite pastille
  « ★★★★★ 5,0 · N avis Google », visible desktop ET mobile, lien vers la fiche Google (nouvel onglet). N vient de
  `content.ts` (`googleReviewCount`, passé de 86 à **92**) ; le lien direct vers les avis est une constante
  `googleReviewsUrl` dans `content.ts` (en attendant le lien de Tom : recherche Google Maps « Cleanyzer Choisy »).
  L'ancienne ligne de note du hero est supprimée (pas de doublon).
- [x] Le bouton « Réserver » du menu et TOUS les boutons « Réserver » de la page ouvrent directement BookingV2.

### Ordre des sections de l'accueil (`home-page.tsx`)
Hero → Présentation (texte + vidéo de Tom) → Avant/après → Prestations & tarifs (existant) → Produits & fournisseurs
(nouveau) → Visite 3D → puis les sections existantes dans leur ordre actuel → FAQ → CTA final.
Toute section existante non citée reste inchangée ; signaler dans le rapport si une section fait doublon avec la maquette.

### Présentation + vidéo de Tom
- [x] Deux colonnes (une sur mobile). La vidéo de Tom ne se lance JAMAIS seule : carte avec bouton
  « Découvrir Cleanyzer en vidéo » → fenêtre plein écran (lightbox) avec le son, bouton fermer, Échap, clic sur le fond,
  fermeture à la fin. `preload="none"` avant le clic. Focus géré (ouverture → bouton fermer, fermeture → bouton lecture).

### Produits & fournisseurs (nouveau)
- [x] Libellé « Nos fournisseurs », H2 « Des produits de detailing professionnels pour votre voiture, à Annecy. »,
  texte et 3 preuves EXACTEMENT comme la maquette. 3 photos : `mousse-porsche.webp`, `tapis-brosse.webp`, et la photo
  de siège après shampoing déjà présente dans le site.
- [x] Bandeau de logos qui défile (logos seuls, sans nom en texte) : OryShine → https://www.oryshine.fr/ et
  Koch-Chemie → https://www.koch-chemie.com/ (cliquables, nouvel onglet) ; Fraber non cliquable ; Alchimy en texte
  (logo à venir). Doublon de défilement en `aria-hidden`. Arrêt du défilement si `prefers-reduced-motion`.

### Visite 3D
- [x] Ne se charge plus au chargement de la page : carte d'aperçu + bouton « Explorer en 3D » ; la 3D (code + modèle)
  n'est chargée qu'au clic (import dynamique).

### Barre de contact
- [x] Pilule discrète fixée en bas, apparaît quand le haut de page n'est plus visible (IntersectionObserver) :
  Réserver (BookingV2) · Appeler · WhatsApp. Hauteur 34 px, police 12,5 px, comme la maquette.
- [x] Numéros : ceux du tenant via `data.getContact()` (`tel:` et `https://wa.me/<numéro international sans +>`) ;
  numéro actuel de Tom : 07 69 76 85 71. Si aucun contact (aperçu sans tenant) : barre avec Réserver seul.

### SEO local (critères vérifiables)
- [x] `<title>` : « Nettoyage auto à domicile à Annecy | Cleanyzer » ; meta description : « Nettoyage intérieur et
  extérieur de votre voiture à domicile, à Annecy et jusqu'à 20 km. Produits professionnels, noté 5/5 sur Google.
  Réservez en ligne. »
- [x] JSON-LD `AutoWash` (ou `LocalBusiness`) sur l'accueil, en plus du FAQPage existant : nom, adresse (Choisy),
  zone desservie, téléphone, horaires, URL, image. Données issues de `getContact()` / du tenant, jamais inventées ;
  champ absent → omis. **Pas d'`aggregateRating`** (avis auto-déclarés interdits par Google).
- [x] Canonical vers le domaine du site, Open Graph (image `og-cleanyzer.jpg`), textes alternatifs sur toutes les images,
  sitemap à jour.
- [x] Mêmes nom, adresse, téléphone que la fiche Google (aucun texte en dur divergent).

## À établir pendant l'AUDIT
- Le composant/fonction qui ouvre BookingV2 aujourd'hui, et l'id de la section Prestations & tarifs.
- Ce que `getContact()` fournit (horaires ? adresse ?) ; s'il manque les horaires, les omettre et le signaler.
- Les sections existantes qui doublonnent avec la maquette (ex. ancienne section produits / univers).

## Critères d'acceptation
- [ ] C1 Rendu conforme à la maquette sur 390 px et 1366 px (captures dans le rapport).
- [ ] C2 Passage arrivée → boucle sans image noire (vérifié en navigateur).
- [ ] C3 Vidéo de Tom et 3D : aucun octet chargé avant le clic (vérifié dans l'onglet réseau).
- [ ] C4 Tous les « Réserver » ouvrent BookingV2 ; « Voir les tarifs » arrive sur les prix existants.
- [ ] C5 PageSpeed mobile ≥ 90 dans les 4 catégories ; LCP < 2,5 s ; CLS < 0,1 (capture).
- [ ] C6 JSON-LD valide au test des résultats enrichis de Google ; un seul H1 ; title et description conformes.
- [ ] C7 Aucun autre tenant impacté ; nombre de tests en échec et d'erreurs TypeScript inchangé (CI L34 verte).

## Après la fusion (Clément)
Brancher le domaine de Cleanyzer ; demander à l'entreprise qui gère la fiche Google d'y mettre l'adresse du site ;
déclarer le site dans Google Search Console ; remplacer `googleReviewsUrl` par le lien de Tom.
