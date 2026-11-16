# L59 — Cleanyzer : une seule DA néon sur TOUT le site + corrections après mise en ligne de L55

Risque : MOYEN (site sur mesure Cleanyzer + habillage de sa réservation ; aucune donnée, aucun prix, aucun paiement).
Branche partie de `main` (L55 fusionné). Médias : `L59-medias.zip` (`unzip -o` à la racine, sur la branche du lot, voir « Médias »).
Aperçu OBLIGATOIRE avant approbation (`.lot-state/L59.apercu.html`) : accueil, une page prestation (rénovation des phares),
zone d'intervention, réalisations, réservation, pied de page — ordinateur ET téléphone. Rien d'autre que Cleanyzer n'est touché.
Aucune mention de Claude/IA.

## Constat (Clément, 12/11/2026, après mise en ligne)
« Il n'y a pas d'univers Cleanyzer : une fois du blanc, une fois du noir, on se perd au fil du site. » Référence d'intention
(PAS à copier) : un site concurrent dont la DA se reconnaît partout, jusque dans le tunnel de réservation : fond très sombre
continu, dégradé néon sur les boutons principaux, sur-titres espacés en couleur, chiffres et mots-clés en couleur d'accent,
cartes sombres à fin liseré, aucune section blanche.

## A. Direction artistique unique (toutes les pages Cleanyzer)
- [x] **Aucune section ni carte blanche/claire nulle part** : accueil, prestations, pages de prestation (dont rénovation des
  phares), zone d'intervention (carte + panneau commune), réalisations / sliders avant-après, FAQ, à propos, demande
  personnalisée, pages légales, réservation, pied de page, barre du haut (aujourd'hui grise/blanche sur les pages prestation).
- [x] **Fond** : `--clz-neon-ink` (#04050a) continu, variations très légères entre sections (dégradé ou lueur), jamais de rupture claire.
- [x] **Couleurs** : bleu `--clz-neon-blue` (#1f7bff) = action/sélection ; rouge `--clz-neon-red` (#ff2b45) = accent/énergie.
  **Bouton principal** = dégradé bleu → rouge avec halo (même que le bouton « Réserver » de la barre flottante, déjà validé) ;
  bouton secondaire = contour lumineux. Sur-titres en capitales espacées en bleu ; dans chaque grand titre, un mot en couleur
  d'accent (comme l'actuel « la différence. »).
- [x] **Cartes** (prestations, formules, zone, avis, FAQ, panneaux de la visite) : fond sombre translucide, liseré `--clz-neon-line`,
  lueur bleue au survol / à la sélection. Badges de formules (Éco, Premium, Excellence, Diamond) déclinés en néon.
- [x] **Typographie** : garder les polices actuelles de Cleanyzer (titres serif + texte sans-serif), mêmes tailles et mêmes
  styles de sur-titre sur toutes les pages. Une seule source de vérité : jetons dans `cleanyzer.css` / `tokens.ts`, plus aucune
  couleur claire codée en dur dans les composants Cleanyzer.
- [x] Contrastes AA partout, `prefers-reduced-motion` respecté (halos fixes, pas d'animation).

## B. Visite vidéo
- [x] **Panneau de zone néon et compact** : sombre translucide (plus de carte blanche). Sur téléphone, hauteur maximale ≈ 30 % de
  l'écran : titre de zone, formules sur une ligne chacune (texte tronqué si besoin), un seul bouton ; le reste (« Voir la formule… »,
  « Voir la prestation en vidéo ») en liens discrets. La voiture et la zone doivent rester visibles au-dessus.
- [x] **Texte quasi invisible** dans le panneau « Rénovation des optiques » (description en gris très pâle / animation bloquée) :
  à corriger, texte lisible dès l'arrivée sur la zone.
- [x] **Rail des zones (ordinateur)** lisible sur les images claires : léger fond sombre ou ombre derrière les libellés.
- [x] **Volant & commandes = une seule image.** Nouvelles images (zip) : 310 images au lieu de 331 ; la première vue du volant est
  supprimée et un fondu relie « aérations » au bon volant. Arrêts : inchangés jusqu'à aérations (7, 31, 61, 91, 133, 168, 217,
  257, 279) ; **volant = 310** (dernière image). Mettre à jour le nombre total d'images et l'arrêt du volant dans le code.

## B2. Films par prestation (même problème, surtout sur téléphone)
- [x] Le bloc texte (numéro, badge, titre, description, cartes de formules avec prix, bouton, deux liens) recouvre tout le film :
  on ne voit plus la vidéo, et la description se lit mal sur l'image. Sur téléphone, le film doit occuper au moins le haut 60 %
  de l'écran, bien visible.
- [x] Bloc compact en bas, sur un dégradé sombre : numéro + titre ; description sur 2 lignes maximum ; formules en lignes
  courtes « Premium · 80 € » (ou pastilles), plus de grandes cartes ; un seul bouton néon ; « Voir la zone… dans la visite » et
  « Retour au choix de formule » regroupés en liens discrets sur une ligne. Mêmes textes, mêmes prix, mêmes liens, rien d'inventé.
- [x] Même style néon que le panneau de la visite (section B), pour que les deux se ressemblent.

## C. Header (ordinateur)
- [x] La vidéo ordinateur était un autre montage (mousse qui apparaît sans lavage, retour au sale). Remplacée par la version
  téléphone recadrée en 16:9 (même histoire : sale → canon à mousse → rinçage → propre), fichiers `neon/hero-arrivee-1080.mp4`,
  `hero-boucle-1080.mp4`, `hero-poster-1080.webp` (zip). Téléphone inchangé (validé).

## D. Accueil
- [x] **« 5,0/5 — 92 avis Google » une seule fois** : il apparaît dans le header ET dans la deuxième section. Le garder dans le
  header, le retirer de la deuxième section (pas d'autre texte modifié).

## E. Réservation (Cleanyzer)
- [x] **Retour au site** : lien bien visible « ← Retour au site » en haut de la réservation (vers la page d'où l'on vient si elle
  est sur le site Cleanyzer, sinon l'accueil) ; le logo ramène à l'accueil.
- [x] **Barre flottante Réserver / Appeler / WhatsApp masquée sur `/reservation`** : elle recouvre le total et le bouton
  « Continuer » (bug sur téléphone).
- [x] Même DA que le reste (section A) : sur-titres, bouton principal en dégradé néon, cartes de choix. Logique, champs, prix,
  moteur de réservation : INCHANGÉS ; `?embed=1` et les autres detailers inchangés ; test `booking-engine-decoupling` intact.

## F. Pied de page
- [x] Le logo Cleanyzer en bas à droite est à moitié coupé par la section précédente : il doit être entièrement visible, sans
  chevauchement, sur ordinateur et téléphone (demande déjà faite auparavant, non traitée).

## G. Liens sur son domaine
- [x] Sur www.cleanyzer.fr, les liens internes pointent vers `/p/cleanyzer/prestations/…` (passage par une redirection). Ils doivent
  pointer directement vers `/prestations/…` quand le site est servi sur son domaine ; inchangé sur les autres accès.

## Médias
Sur la branche du lot, AVANT d'approuver :
```
cd ~/detail-flow && git rm -r -q public/custom-sites/cleanyzer/visite-video && unzip -o ~/Téléchargements/L59-medias.zip \
 && git add public/custom-sites/cleanyzer && git commit -m "L59 : médias (volant unique, header ordinateur)"
```

## Critères d'acceptation
- [ ] C1 Aucune couleur de fond claire dans les composants Cleanyzer (test qui parcourt les fichiers / classes) ; jetons uniques.
- [ ] C2 Visite : 310 images, arrêt volant 310, panneau ≤ 30 % de hauteur sur téléphone, texte lisible (tests + capture).
- [ ] C2b Films : sur téléphone (390 px), le bloc texte occupe au plus 40 % de la hauteur (capture).
- [ ] C3 Note Google affichée une seule fois sur l'accueil (test).
- [ ] C4 Réservation Cleanyzer : lien retour présent, barre flottante absente ; autres tenants et embed inchangés (tests).
- [ ] C5 Liens internes sans `/p/cleanyzer` sur le domaine (test).
- [ ] C6 Captures ordinateur + téléphone de : accueil, page rénovation des phares, réservation étape 2, pied de page.
- [ ] C7 Pas plus de tests en échec ni d'erreurs TypeScript qu'avant.

## Après fusion (Clément)
Tester www.cleanyzer.fr (téléphone + ordinateur) de l'accueil jusqu'à la réservation, puis montrer à Tom.
