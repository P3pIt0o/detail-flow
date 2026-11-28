# L96 — Tableau de bord « Aujourd'hui » refait : pro, utile, adapté à chaque detailer

Risque : moyen (interface admin, lecture seule des données ; aucune migration attendue). Demande de Clément (27/11) : « refaire le dashboard qui fait
brouillon, du tout pro ; trouve une meilleure solution qui s'adapte à chaque detailer ». Capture actuelle : `docs/lots/L96-medias/`.
Référence d'expérience : l'écran « Aujourd'hui » de GroomFlow (lecture seule de `~/groom-flow`, ne jamais le modifier) et la navigation de L77.

## Ce qui ne va pas aujourd'hui (capture)
3 gros boutons empilés avant toute information · cartes vides (« Aucun rendez-vous aujourd'hui », « Aucun rendez-vous les jours suivants ») · rangées
de chiffres à 0,00 € · « Dernières visites » avec des données de test illisibles · tout est une carte, même importance pour tout · « Copier mon lien »
en haut alors que la navigation du bas existe déjà.

## Principe : un écran = la question « qu'est-ce que je fais maintenant ? »
L'écran se compose selon la **situation réelle** du detailer, calculée côté serveur en **une seule requête groupée** (rendu serveur, pas de spinner) :
1. **Compte qui démarre** (profil, prestations, horaires ou page incomplets, ou aucune réservation encore reçue) : une liste « Pour recevoir vos
   premières réservations » de 3 à 5 étapes avec barre de progression, chacune ouvrant directement le bon réglage ; dernière étape « Partager votre
   lien » (copier, QR code, WhatsApp). Disparaît quand tout est fait.
2. **Journée avec rendez-vous** : en haut, le **prochain rendez-vous** en grand (heure, client, véhicule, prestation, adresse avec bouton itinéraire
   si à domicile, appeler, « Terminer et encaisser ») ; dessous, la frise de la journée. 3 touches max pour finir une visite et encaisser.
3. **Journée vide** : pas de carte vide. Une ligne « Rien aujourd'hui · prochain rendez-vous jeudi 9 h » + une action utile au choix du moment :
   relancer des clients pas revenus depuis longtemps (si la fonction existe dans son plan), partager son lien, bloquer la journée.
4. **À traiter** (seulement s'il y en a) : demandes de réservation ou demandes spéciales en attente, devis à relancer, factures impayées, acomptes non
   reçus, avis reçus. Chaque ligne = une action en une touche. Rien à traiter → section absente.
5. **Chiffres** : une seule ligne compacte en bas (CA du mois, encaissé, rendez-vous du mois) avec la comparaison au mois précédent ; masquée tant
   qu'il n'y a encore aucun chiffre (pas de 0,00 €). Les visites du site rejoignent cette ligne ou « Statistiques » dans « Plus ».
Adaptation au profil (données déjà connues : lieu domicile/atelier/les deux, formule, modules activés) : itinéraire seulement à domicile ; acompte et
paiements en ligne seulement s'ils sont activés ; abonnements clients seulement s'il en a. Aucun réglage supplémentaire à faire par le detailer.

## Forme
Moins de cartes : hiérarchie par la taille et l'espace, un seul bloc mis en avant (le prochain rendez-vous). Mobile d'abord (cibles ≥ 44 px, actions en
bas, texte ≥ 14 px, contraste ≥ 4,5:1), vouvoiement, aucun jargon. Le bouton « + » de la navigation reste l'entrée de création (pas de 3 boutons en haut).
Sur ordinateur : deux colonnes (journée à gauche, à traiter + chiffres à droite).

## Réussite
Tests de composition (compte neuf, journée chargée, journée vide, rien à traiter, plan sans paiements), tenant B ≠ A sur la requête groupée, une seule
requête par rendu (test). Aperçu `.lot-state/L96.apercu.html` : les 3 situations sur téléphone + l'ordinateur.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.
