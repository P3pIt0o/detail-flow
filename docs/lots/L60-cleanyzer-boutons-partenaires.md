# L60 — Cleanyzer : boutons inactifs (URGENT) + « Ils nous font confiance » + avant/après RS3

Risque : MOYEN (site sur mesure Cleanyzer uniquement ; aucune donnée, aucun prix, aucun paiement). Branche partie de `main`
(après fusion de L59 si elle est fusionnée ; sinon partir de `main` et ne PAS toucher aux fichiers déjà modifiés par L59 sans
le signaler). Médias : `L60-medias.zip` (`unzip -o` à la racine, sur la branche du lot, puis commit) + logos fournis par Tom
dans `public/custom-sites/cleanyzer/partenaires/` (voir C). Aperçu obligatoire avant approbation. Aucune mention de Claude/IA.

## A. URGENT — sur www.cleanyzer.fr, aucun bouton ne répond (seule la visite vidéo marche)
Signalé par Tom le 16/11/2026, surtout sur téléphone. Le site est en ligne : c'est la priorité du lot.
> **Hypothèse non confirmée, test téléphone à faire (Clément).** Cases A décochées le 17/11/2026 : cause non établie,
> reproduction non faite. Ne pas dire à Tom (ni ailleurs) que c'est réglé avant ce test.
- [ ] Reproduire avec Playwright (téléphone 390×844 ET ordinateur 1280×800) sur un build de `main` : cliquer chaque bouton et
  lien de l'accueil (menu, « Voir les prestations et tarifs », « Réserver », cartes prestations, « Réalisations », formules,
  barre flottante Réserver/Appeler/WhatsApp, pied de page) et vérifier la navigation.
- [ ] Trouver l'élément qui intercepte les clics (`document.elementFromPoint` au point cliqué) : piste la plus probable = une
  couche plein écran de la visite ou des films (canvas/scène collante, voile, conteneur fixe) qui reste au-dessus du contenu
  ou garde `pointer-events` actifs, ou un gestionnaire de défilement/swipe qui annule les clics (`preventDefault` sur
  touch/click). Corriger la cause, sans désactiver la visite ni les films.
- [ ] Test de non-régression : sur l'accueil rendu, aucun élément plein écran transparent n'est au-dessus des liens hors de la
  section visite/films ; les gestionnaires de swipe n'appellent `preventDefault` que dans leur section.
- [ ] Mentionner dans le rapport la cause exacte trouvée (non établie : « hypothèse non confirmée, test téléphone à faire »).

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
- [ ] *(reporté au lot suivant, décision du 17/11/2026)* **Logos partenaires** : garder leurs couleurs de marque (pas de silhouette blanche) sur une petite pastille claire limitée
  au logo, comme décidé dans L59 ; adapter le test « aucun fond clair » pour autoriser uniquement cette pastille.
- [x] **Liens sans `/p/cleanyzer` décidés par l'hôte de la requête**, plus par `NEXT_PUBLIC_VERCEL_ENV` : préfixe retiré au rendu
  seulement quand le serveur reconnaît l'hôte comme Cleanyzer (www.cleanyzer.fr et cleanyzer.fr) ; partout ailleurs
  (*.vercel.app, previews, local, `/cleanyzer-preview`, hôte inconnu, autres tenants, `?embed=1`) comportement actuel. Tests :
  un cas par hôte + rendu des pages dans les deux modes. Aucune variable d'environnement ajoutée.

## D2. DA plus marquée (Clément, 16/11/2026 soir, après mise en ligne de L59)
- [ ] *(reporté au lot suivant, décision du 17/11/2026)* « Pas assez de néon, il manque de rouge », surtout dans les sliders avant/après et les cartes. Renforcer avec les jetons
  existants : liseré lumineux bleu → rouge autour des sliders et des cartes, poignée du slider en dégradé bleu → rouge avec
  halo, étiquettes « Avant » (rouge) / « Après » (bleu), lueurs rouges et bleues floues derrière les sections, sur-titres et
  mots d'accent alternant bleu et rouge. Même intensité sur toutes les pages (accueil, prestations, zone, réalisations).
  Contraste AA, mouvement réduit respecté, aucun texte modifié.

## E. Demandes de Tom (16/11/2026, soir)
- [ ] *(reporté au lot suivant, décision du 17/11/2026)* **Visite : la vidéo de la prestation joue directement dans chaque zone.** En arrivant sur une zone, le film de la
  prestation correspondante (bandes de `film/` déjà en place) se lance tout seul dans la zone, sans clic ; le lien
  « Voir la prestation en vidéo » disparaît et devient « Voir la prestation en photo » (les photos avant/après de la zone quand
  elles existent ; sinon pas de lien). Repli inchangé : mouvement réduit / économie de données → image fixe, pas d'autoplay.
  Une seule vidéo jouée à la fois, mise en pause hors écran, rien chargé avant l'approche de la section.
- [x] **Prix : formule Excellence (intérieur, avec shampoing) pour SUV = 165 €.** Mettre à jour le barème du site
  (`content.ts` et partout où ce prix est affiché, JSON-LD compris) ; ne rien inventer pour les autres tailles. Le prix réel de
  la réservation vient de l'admin DetailFlow de Tom : Clément le met à 165 € lui-même (voir « Après fusion »), le lot ne touche
  pas aux données. Test : le site affiche 165 € pour Excellence SUV.

## Reporté au lot suivant — décision de Clément, 17/11/2026
Périmètre réduit après la revue : sortent de L60 et restent à faire dans le lot suivant :
- E (film automatique par zone) — le prix SUV 165 € reste dans L60 et est livré ;
- D2 (DA rouge/néon : tubes, liseré bleu → rouge, mot rouge par titre, icônes FAQ rouges) ;
- la pastille des logos partenaires (fond transparent + halo) ;
- les ajouts de landing du 16/11 21h55 (logo seul au chargement, boutons sous le header, barre en fondu, dock tardif).
Ajoutés à L60 le 17/11/2026 : logo et lien partenaire sur les cartes d'avis, retrait de `L60-medias.zip`, tests C1/D sur
l'accueil entier, test des liens `/p/cleanyzer` des pages non migrées sur www.cleanyzer.fr (308 sans boucle).
Reporté aussi (décision de Clément, 17/11/2026) :
- avis en défilement horizontal accroché (`snap-x`) sur téléphone : les avis restent empilés dans L60, écart validé ;
- bande des partenaires sur le **même composant** que la bande des fournisseurs (extraction d'un composant partagé, ce qui
  touche `fournisseurs.tsx` : hors périmètre approuvé, replan nécessaire). Déjà identiques aujourd'hui : mêmes classes CSS
  (`clz-neon-band/marquee/track/sup`), donc même vitesse, même rendu, même mouvement réduit ; logos cliquables en nouvel onglet.
Magasin Perrin = même entreprise que Perrin Electric (confirmé par Clément) : logo et lien partenaire conservés.
Point A : voir « Non confirmé — point A » plus bas (protocole de test, pas de fusion avant).

## Relecture du 17/11/2026 (revue sécurité + revue métier sur 96b8abc)
Revue métier : OK, 0 majeur. Revue sécurité : A_CORRIGER, 2 « majeurs » traités ainsi.
- **Majeur 1 — FAUX POSITIF (pas de correctif de code).** La revue dit que `local-page`, `prestations`, `pages` et `configurator`
  gardent la base `/p/cleanyzer` sur www.cleanyzer.fr. Ces quatre fichiers ne servent que les **maquettes** `/cleanyzer-preview/*`,
  pas le site public. Preuve vérifiable :
  ```
  grep -rnE "cleanyzer/(local-page|prestations|pages|configurator)[\"']" app components lib
  ```
  → 9 résultats, tous dans `app/cleanyzer-preview/*` (faq, reservation, prestations/{interieur,exterieur,textile}, realisations,
  zones/annecy, tarifs, a-propos), aucun ailleurs. Et `middleware.ts:144` (`!path.startsWith("/cleanyzer-preview")`) sert cette
  route telle quelle, sans réécriture vers la vitrine ni contexte tenant. Leurs liens et leur navigation utilisent déjà
  `CLZ_PREVIEW_BASE` (`/cleanyzer-preview`), jamais `/p/cleanyzer` comme base de site. Les pages réellement publiques
  (`home-page`, `service-page`, `neon-page`) sont déjà sur `ClzHostShell`. Migrer les maquettes n'aurait rien corrigé et les aurait
  rendues dynamiques : décision de Clément de ne pas y toucher. **Les bugs des maquettes relèvent du petit lot séparé D7.**
  Tests ajoutés : liens directs à la racine / `/p/cleanyzer` ailleurs pour prestations, zone d'intervention et pages communes (neon) ;
  autre tenant → page rendue sans coquille Cleanyzer ; garde « les quatre fichiers ne sont importés que depuis
  `app/cleanyzer-preview` » et « le middleware sert `/cleanyzer-preview` tel quel ».
- **Majeur 2 — à vérifier par Clément (pas fait dans le sandbox).** `headers()` dans `ClzHostShell` : dans les journaux de build
  Vercel, comparer ○ (statique) / ƒ (dynamique) entre `main` avant L60 et la preview L60, pour l'**accueil** et les **prestations**.
  Un test (`l60`) établit qu'elles lisent déjà le tenant par en-tête, donc dynamiques avant L60 ; le build le confirme.
  `neon-page` n'appelle le shell que si le site publié du tenant est Cleanyzer (testé : autre tenant → page inchangée).
- **Mineur fait** : `width` ajouté aux logos partenaires qui ont `w`/`h` (CLS). Morel Piscine et Brin de Verdure n'ont pas de
  dimensions connues : inchangés.
- **Ville des partenaires** (décision du 17/11) : aucune ville confirmée, donc recherche Maps par nom seul (`partnerHref`), sans
  « Annecy » en dur. L'avis « Magasin Perrin » utilise la même recherche que la bande (`mapsName: "Perrin Electric"`, même entreprise).
  **Lot suivant** : champ `city` par partenaire dans `CLZ_PARTNERS` une fois les villes confirmées par Clément.
- **Aperçu** `L60.apercu.html` : voir « Écarts de l'aperçu » ci-dessous.

## Non confirmé — point A (boutons inactifs sur www.cleanyzer.fr)
La cause exacte n'est **pas établie**. Le correctif (liens `<a>` natifs vers la racine du domaine) reste une hypothèse. Il ne
faut pas dire à Tom que c'est réglé avant ce test.
**Protocole de test, après le push (Clément) :**
1. Ouvrir la preview Vercel de la branche `lot/L60-cleanyzer-boutons-partenaires`.
2. Sur un téléphone réel, puis dans DevTools en 390×844, cliquer chaque bouton : header, réserver, prestations, zone
   d'intervention, partenaires.
3. Dans la console DevTools, `document.elementFromPoint(x, y)` au centre de chaque bouton : l'élément retourné doit être le
   bouton (ou son lien `<a>`), pas une couche qui le recouvre.
4. Noter chaque bouton qui ne répond pas et l'élément qui le recouvre.
**Règle : pas de fusion avant ce test.**

## Écarts de l'aperçu — validés par Clément le 17/11/2026
`L60.apercu.html` ne reflète pas le rendu final. Écarts connus et validés :
- avis empilés (et non en défilement horizontal accroché) ;
- bande de logos partenaires défilante ;
- logo seul au chargement (reporté au lot suivant, voir plus haut) ;
- boutons du header.
La régénération de `L60.apercu.html` revient à Clément (non faite ici).

## Écart de plan — `zone-module.tsx`
Ce fichier n'était pas dans le plan approuvé ; il est modifié. Raison : deux de ses boutons restaient sur la base
`/p/cleanyzer` alors que le site est servi sur www.cleanyzer.fr. Ils passaient par une redirection 308 et fonctionnaient : ce
n'est pas le problème des boutons inactifs (point A). Correction faite pour avoir des liens directs à la racine. Ces deux boutons
ont été détectés ce matin par les tests C1/D de `l60`, qui les couvrent (zone d'intervention : liens directs à la racine sur
www.cleanyzer.fr, `/p/cleanyzer` ailleurs).

## Écart « 9/11 tests de baseline » — à vérifier par Clément
La justification n'a pas pu être vérifiée dans le sandbox (tests BDD/réseau ignorés). À vérifier par Clément avec
`dfguard.mjs check L60` : comparer les tests en échec avant (`main`) et après L60, et confirmer que les 9/11 sont les mêmes
échecs déjà présents (critère C4) avant de la considérer comme justifiée.

## Critères d'acceptation
- [ ] C1 Test Playwright (ou test de rendu équivalent) : chaque bouton/lien de l'accueil mène à sa cible, sur téléphone et ordinateur.
- [ ] C2 Slider : la paire RS3 est la première ; autres paires inchangées.
- [ ] C3 Partenaires : Trofeo absent ; les 5 ajoutés présents (logo ou nom).
- [ ] C4 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant ; autres tenants non touchés.

## Après fusion (Clément)
Dans l'admin DetailFlow de Cleanyzer, mettre la prestation Excellence intérieur / SUV à 165 € (pour que la réservation affiche
le même prix que le site). Tester www.cleanyzer.fr sur téléphone : tous les boutons, la visite (vidéo directe), le prix, puis
montrer à Tom.
