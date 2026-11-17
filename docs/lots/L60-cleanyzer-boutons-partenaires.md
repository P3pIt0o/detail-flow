# L60 — Cleanyzer : boutons inactifs (URGENT) + « Ils nous font confiance » + avant/après RS3

Risque : MOYEN (site sur mesure Cleanyzer uniquement ; aucune donnée, aucun prix, aucun paiement). Branche partie de `main`
(après fusion de L59 si elle est fusionnée ; sinon partir de `main` et ne PAS toucher aux fichiers déjà modifiés par L59 sans
le signaler). Médias : `L60-medias.zip` (`unzip -o` à la racine, sur la branche du lot, puis commit) + logos fournis par Tom
dans `public/custom-sites/cleanyzer/partenaires/` (voir C). Aperçu obligatoire avant approbation. Aucune mention de Claude/IA.

## A. URGENT — sur www.cleanyzer.fr, aucun bouton ne répond (seule la visite vidéo marche)
Signalé par Tom le 16/11/2026, surtout sur téléphone. Le site est en ligne : c'est la priorité du lot.
- [x] Reproduire avec Playwright (téléphone 390×844 ET ordinateur 1280×800) sur un build de `main` : cliquer chaque bouton et
  lien de l'accueil (menu, « Voir les prestations et tarifs », « Réserver », cartes prestations, « Réalisations », formules,
  barre flottante Réserver/Appeler/WhatsApp, pied de page) et vérifier la navigation.
- [x] Trouver l'élément qui intercepte les clics (`document.elementFromPoint` au point cliqué) : piste la plus probable = une
  couche plein écran de la visite ou des films (canvas/scène collante, voile, conteneur fixe) qui reste au-dessus du contenu
  ou garde `pointer-events` actifs, ou un gestionnaire de défilement/swipe qui annule les clics (`preventDefault` sur
  touch/click). Corriger la cause, sans désactiver la visite ni les films.
- [x] Test de non-régression : sur l'accueil rendu, aucun élément plein écran transparent n'est au-dessus des liens hors de la
  section visite/films ; les gestionnaires de swipe n'appellent `preventDefault` que dans leur section.
- [x] Mentionner dans le rapport la cause exacte trouvée.

## B. Avant / après
- [x] Ajouter la paire Audi RS3 (mousse → propre, sous la tente rouge) au slider avant/après, en premier :
  `avant-apres/rs3-avant.webp` / `rs3-apres.webp` (zip). Texte alternatif : « Audi RS3 pendant le lavage » / « Audi RS3 après
  le lavage ». Les autres paires restent.

## C. « Ils nous font confiance » (logos partenaires) — demandes de Tom
- [x] Retirer **Trofeo** ; ajouter **Exutoire Nettoyage**, **Accord Immobilier**, **Prestige Drive**, **Peugeot Mouthon**,
  **Flèche Taxis 74** ; garder les autres partenaires actuels (dont Morel Piscine et Brin de Verdure s'ils y sont).
- [x] Logos : fichiers fournis par Tom (`partenaires/<nom>.png|webp`). Pour un partenaire dont le logo n'est pas encore fourni :
  afficher son nom en texte dans le même style (pastille sombre néon), jamais de logo inventé ou redessiné.
- [x] Logos lisibles sur fond sombre (pastille claire limitée au logo si nécessaire, comme décidé dans L59).
- [x] **Logos fournis (zip, `partenaires/`)** : `morel-piscine.webp`, `brin-de-verdure.webp`, `garage-mouthon-peugeot.webp`
  (petit fichier 200×75 : l'afficher à sa taille, sans l'agrandir au-delà), `fleche-taxis-74.webp`. Pas encore de logo pour
  Exutoire Nettoyage, Accord Immobilier, Prestige Drive → nom en texte (pastille néon).
- [x] **Logos cliquables** : chaque logo/nom est un lien qui s'ouvre dans un nouvel onglet (`rel="noopener noreferrer"`).
  Cible : le site du partenaire si son adresse est connue dans le dépôt ou fournie par Clément ; sinon une recherche Google Maps
  du nom + ville (`https://www.google.com/maps/search/?api=1&query=<Nom>+<ville>`). Ne jamais inventer d'adresse de site.
  Libellé accessible : « <Nom> — ouvrir dans un nouvel onglet ».
- [x] **Avis des professionnels** (vrais avis Google, recopiés mot pour mot, avec la mention « Avis Google » et 5 étoiles ;
  aucun autre avis ajouté, aucun texte modifié) affichés avec le logo du partenaire, logo cliquable comme ci-dessus :
  - **Magasin Perrin** : « Travail de pro. Je recommande fortement »
  - **Brin de Verdure** : « Un nettoyage parfait à la hauteur de mes attentes »
  - **Prestige Drive** : « Excellent professionnel, travail sérieux et toujours soigné. Nous avons la chance de collaborer avec
    Cleanyzer dans le cadre de notre activité chez Prestige Drive, et nous sommes pleinement satisfaits de ce partenariat. Les
    véhicules sont toujours préparés avec soin, le résultat est impeccable et le service est vraiment à la hauteur. C'est un
    partenaire de confiance, professionnel, réactif et appliqué. Nous recommandons sans hésitation »
  Pas de JSON-LD `Review` pour ces avis (Google les interdit pour des avis non collectés sur le site) ; la note globale reste celle déjà affichée.

## D. Reliquats de L59 (décidés par Clément le 16/11/2026)
- [x] **Note Google une seule fois sur tout l'accueil** : la garder dans le haut de page ; dans « Avis clients », retirer le
  « 5,0 / 5 », les étoiles et « Basé sur 92 avis Google », garder le titre et le bouton « Voir les avis Google ». Test sur
  l'accueil entier.
- [x] **Logos partenaires** : garder leurs couleurs de marque (pas de silhouette blanche) sur une petite pastille claire limitée
  au logo, comme décidé dans L59 ; adapter le test « aucun fond clair » pour autoriser uniquement cette pastille.
- [x] **Liens sans `/p/cleanyzer` décidés par l'hôte de la requête**, plus par `NEXT_PUBLIC_VERCEL_ENV` : préfixe retiré au rendu
  seulement quand le serveur reconnaît l'hôte comme Cleanyzer (www.cleanyzer.fr et cleanyzer.fr) ; partout ailleurs
  (*.vercel.app, previews, local, `/cleanyzer-preview`, hôte inconnu, autres tenants, `?embed=1`) comportement actuel. Tests :
  un cas par hôte + rendu des pages dans les deux modes. Aucune variable d'environnement ajoutée.

## D2. DA plus marquée (Clément, 16/11/2026 soir, après mise en ligne de L59)
- [x] « Pas assez de néon, il manque de rouge », surtout dans les sliders avant/après et les cartes. Renforcer avec les jetons
  existants : liseré lumineux bleu → rouge autour des sliders et des cartes, poignée du slider en dégradé bleu → rouge avec
  halo, étiquettes « Avant » (rouge) / « Après » (bleu), lueurs rouges et bleues floues derrière les sections, sur-titres et
  mots d'accent alternant bleu et rouge. Même intensité sur toutes les pages (accueil, prestations, zone, réalisations).
  Contraste AA, mouvement réduit respecté, aucun texte modifié.

## E. Demandes de Tom (16/11/2026, soir)
- [x] **Visite : la vidéo de la prestation joue directement dans chaque zone.** En arrivant sur une zone, le film de la
  prestation correspondante (bandes de `film/` déjà en place) se lance tout seul dans la zone, sans clic ; le lien
  « Voir la prestation en vidéo » disparaît et devient « Voir la prestation en photo » (les photos avant/après de la zone quand
  elles existent ; sinon pas de lien). Repli inchangé : mouvement réduit / économie de données → image fixe, pas d'autoplay.
  Une seule vidéo jouée à la fois, mise en pause hors écran, rien chargé avant l'approche de la section.
- [x] **Prix : formule Excellence (intérieur, avec shampoing) pour SUV = 165 €.** Mettre à jour le barème du site
  (`content.ts` et partout où ce prix est affiché, JSON-LD compris) ; ne rien inventer pour les autres tailles. Le prix réel de
  la réservation vient de l'admin DetailFlow de Tom : Clément le met à 165 € lui-même (voir « Après fusion »), le lot ne touche
  pas aux données. Test : le site affiche 165 € pour Excellence SUV.

## Critères d'acceptation
- [ ] C1 Test Playwright (ou test de rendu équivalent) : chaque bouton/lien de l'accueil mène à sa cible, sur téléphone et ordinateur.
- [ ] C2 Slider : la paire RS3 est la première ; autres paires inchangées.
- [ ] C3 Partenaires : Trofeo absent ; les 5 ajoutés présents (logo ou nom).
- [ ] C4 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant ; autres tenants non touchés.

## Après fusion (Clément)
Dans l'admin DetailFlow de Cleanyzer, mettre la prestation Excellence intérieur / SUV à 165 € (pour que la réservation affiche
le même prix que le site). Tester www.cleanyzer.fr sur téléphone : tous les boutons, la visite (vidéo directe), le prix, puis
montrer à Tom.
