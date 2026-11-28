# L102 — Admin allégé pour les sites sur mesure (Cleanyzer d'abord)

Risque : moyen (interface admin ; aucun changement de données ni de droits par plan ; aucune migration). Demande de Clément (27/11) : « nettoyer l'admin
de Cleanyzer, tout ce dont il n'a pas besoin on enlève, comme partager son lien vu que c'est un site personnalisé ». Le site Cleanyzer est terminé :
**ne rien changer au site public de Cleanyzer** (tests de non-régression Cleanyzer verts, aucune modification de `components/custom-sites/cleanyzer/`
sauf si un réglage admin doit pointer vers lui).

## À faire
1. Audit (dans le plan) : pour Cleanyzer, lister chaque élément de l'admin (menu, tableau de bord, paramètres, boutons) et dire s'il a un effet sur ce que
   ses clients voient ou sur son activité (rendez-vous, clients, factures, paiements, prestations, horaires, avis Google en direct, demandes…) ou s'il ne
   sert qu'à la page professionnelle standard `/p/<slug>` qu'il n'utilise pas.
2. Un seul « profil d'admin » par site sur mesure, décrit dans un fichier (`lib/admin/custom-site-admin-profile.ts`) : liste de ce qui est masqué, avec la
   raison. Défaut pour Cleanyzer : masquer « Copier mon lien » / partager son lien / QR code / widget à intégrer, réglages de la page standard qu'il
   n'affiche pas (apparence, contenu, galerie et textes de la page standard s'ils ne sont pas lus par son site), carte digitale (L86), étapes
   « partager votre lien » du tableau de bord (L96), statistiques de visites de la page standard. Garder tout ce qui agit sur son site ou son activité.
   Là où un lien reste utile, afficher **le lien de son site** (son domaine) plutôt que `/p/<slug>`.
3. Masqué = absent du menu **et** URL directe redirigée vers l'accueil des paramètres (pas d'écran cassé) ; aucune action serveur supprimée ni affaiblie.
4. Spirit ACS, JustClean, Rozan : profil vide par défaut (rien ne change pour eux dans ce lot), prêt à être rempli plus tard.
5. Tests : profil Cleanyzer appliqué (éléments absents, redirections), tenant sans site sur mesure inchangé, Spirit inchangé, tenant B ≠ A.
6. L96 (tableau de bord) et L97 (paramètres) doivent respecter ce profil : si l'un d'eux est fait avant, l'adapter ; sinon le noter dans leur plan.
Aperçu : `.lot-state/L102.apercu.html` — admin Cleanyzer avant/après (téléphone).

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
