# L97 — Paramètres refaits : simples, compréhensibles, regroupés

Risque : moyen (interface ; les actions serveur existantes sont réutilisées telles quelles, aucune migration). Demande de Clément (27/11).

## Aujourd'hui
5 groupes et ~20 onglets (`lib/admin/settings-nav.ts`) : Entreprise, Coordonnées, Réservations, Horaires, Congés, Planning & acompte, Lieu, Site public,
Contenu du site, Apparence, Galerie, Avis, Demandes spéciales, Paiements, Facturation, Codes promo, Rappels SMS, Rappels & avis, Sécurité, Mes données,
Support… Le detailer ne sait pas où chercher, certains réglages se recoupent.

## Nouvelle organisation (6 entrées, une question chacune)
1. **Mon entreprise** — nom, logo, coordonnées, SIREN/TVA (pour les factures), lieu d'intervention (domicile / atelier / les deux, zone).
2. **Mes prestations et prix** — lien vers le catalogue existant + gabarits de véhicules.
3. **Mes disponibilités** — horaires, congés, délai minimum, durée entre deux rendez-vous, heures de début (L75).
4. **Ma page de réservation** — contenu, apparence, galerie, avis, demandes spéciales, carte digitale (L86), lien et QR code.
5. **Paiements et factures** — acompte, paiements en ligne, facturation (mentions, numérotation, Factur-X de L87), codes promo.
6. **Messages aux clients** — rappels, demandes d'avis, SMS et crédits.
Plus, en bas : **Mon compte** (sécurité, mes données, abonnement, assistance).

## Règles
- Page d'accueil des paramètres = ces 6 entrées, chacune avec une ligne d'état en clair (« Acompte de 30 % demandé », « Rappel la veille à 18 h »)
  et un point orange si quelque chose manque pour bien fonctionner. **Recherche** en haut (« acompte », « horaires », « SMS »…) qui mène au réglage exact.
- Dans chaque écran : l'essentiel visible, l'avancé replié sous « Plus d'options » ; valeurs par défaut sensées ; une phrase d'aide sous chaque réglage
  qui dit l'effet pour le client ; enregistrement immédiat avec retour visuel < 100 ms (ou bouton unique en bas fixe sur mobile).
- **Aucun réglage perdu** : tableau de correspondance ancien onglet → nouvel emplacement dans `docs/audits/L97-correspondance.md`, testé ; les anciennes
  URL redirigent vers le nouvel emplacement. Les réglages des sites sur mesure (Spirit, Cleanyzer…) restent accessibles pour ces tenants seulement.
- Droits par plan inchangés et contrôlés côté serveur ; une fonction hors formule s'affiche avec « Disponible avec Indépendant » (texte existant), jamais
  un écran cassé. Tenants : actions existantes conservées (`requireCompanyMember()`), tests tenant B ≠ A sur toute action déplacée.
- Moins de cartes : listes et sections séparées par l'espace et de fines lignes.

## Réussite
Tests : chaque ancien réglage joignable, redirections, recherche, droits par plan. Aperçu `.lot-state/L97.apercu.html` : accueil des paramètres (téléphone
+ ordinateur) et l'écran « Paiements et factures ».

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
