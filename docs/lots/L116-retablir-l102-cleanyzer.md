# L116 — Rétablir L102 (admin allégé des sites sur mesure), défait par L96

Risque : moyen (affichage admin et menus, aucune donnée, aucune migration, aucun paiement). URGENT : client en production (Cleanyzer).

## Ce qui s'est passé
L102 (« admin allégé pour les sites sur mesure », fusionné : commit `81b7174`, PR #313) fonctionnait : sur Cleanyzer, pas d'invitation à
partager le lien, pas de bouton « Intégrer la réservation », « Voir mon site » à la place, menus et réglages allégés.
L96 (commit `124895d`, PR #314) a été envoyé sous forme d'un commit unique reconstruit à partir de l'ancienne version de ses fichiers :
il a **remis l'ancien contenu** de presque tous les fichiers touchés par L102. Les fichiers créés par L102
(`lib/admin/custom-site-admin-profile.ts`, `tests/l102-admin-allege.test.ts`) sont toujours là, mais plus utilisés.
Constat de Clément le 27/11 à 21 h 46 : l'accueil de Cleanyzer affiche de nouveau « Intégrer la réservation » et « Partagez votre lien de
réservation » (Copier mon lien, QR code, WhatsApp).

## À faire
1. Réappliquer **tout le comportement de L102** sur le main actuel : `git show 81b7174^2` / `git diff 81b7174^1 81b7174` donne le changement exact.
   `git apply -3` passe proprement sur 9 fichiers ; 4 sont en conflit car L96 et L97 les ont modifiés depuis :
   `app/admin/(dashboard)/page.tsx` (L96 a déplacé le tableau de bord dans de nouveaux composants : y reporter la règle de L102),
   `components/admin/admin-shell.tsx`, `lib/admin/settings-nav.ts`, `lib/admin/settings-search.ts`.
2. **Garder tout ce qu'ont apporté L96 et L97** (nouveau tableau de bord adaptatif, refonte des paramètres) pour les autres detailers :
   seule la règle « site sur mesure » de L102 revient par-dessus.
3. Sur le nouveau tableau de bord L96, pour un site sur mesure (profil de `lib/admin/custom-site-admin-profile.ts`) : pas de carte
   « Partagez votre lien de réservation », pas de bouton « Intégrer la réservation » en haut, « Voir mon site » comme dans L102.
4. Les tests `tests/l102-admin-allege.test.ts` doivent repasser au vert, ainsi que ceux de L96 et L97. Ajouter un test sur le nouveau tableau
   de bord : site sur mesure = ni carte de partage ni bouton d'intégration.

## Hors périmètre
Aucune autre modification du tableau de bord ni des paramètres. Ne rien changer au comportement des detailers sans site sur mesure.
Aucune décision de Clément nécessaire : tout est déjà décidé par L102, L96 et L97.
