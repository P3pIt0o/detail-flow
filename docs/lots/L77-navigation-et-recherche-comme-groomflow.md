# L77 — Interface : navigation comme GroomFlow, page « Plus » reclassée et recherche des réglages en un clic

Risque : moyen (navigation de l'espace pro, aucune donnée, aucun paiement, aucune migration).

## Demande (Clément, 24/11/2026)
Reprendre l'amélioration des onglets de GroomFlow (plus intuitive) pour DetailFlow, tout reclasser, et ajouter une barre de recherche :
si un detailer veut modifier quelque chose, il le trouve en un clic.

## S'inspirer de GroomFlow — LECTURE SEULE de ~/groom-flow (ne jamais le modifier)
- `components/admin/mobile-tab-bar.tsx` : barre du bas « Aujourd'hui · Agenda · (+) · Clients · Plus », bouton (+) central qui ouvre
  « Nouveau RDV / Nouveau client / Encaisser ».
- Page « Plus » en rubriques : MON ACTIVITÉ (prestations, produits, factures, export, tous les rendez-vous, statistiques),
  ME FAIRE CONNAÎTRE (page publique, offres & réductions, avis clients, site personnalisé), RÉGLAGES (paiements en ligne,
  tous les réglages, mon abonnement), « Copier mon lien », compte connecté, déconnexion.
- Lots de référence : docs/lots/L151, L166, L175, L178, L182 (lire la fiche et le code correspondant).
- Adapter les textes au detailing (véhicules, prestations, pas d'animaux). Garder les couleurs et l'identité de DetailFlow.

## À faire
1. Même structure de navigation (barre du bas sur mobile ; équivalent en menu latéral sur ordinateur) et page « Plus » reclassée
   avec les écrans existants de DetailFlow (rien supprimé, chaque écran garde son adresse ; liens à jour).
2. **Recherche des réglages** en haut de « Plus » et de « Tous les réglages » : on tape « horaires », « acompte », « congés »,
   « SMS », « logo »… → la liste filtre en direct et un clic ouvre directement le bon réglage (onglet + section). Index des réglages
   écrit en dur (titres, mots-clés, synonymes), sans appel serveur. Fonctionne sans souris (clavier) et sur mobile.
3. **Accueil « Aujourd'hui »** : rendez-vous du jour, totaux prévus, dernières visites. La carte de tournée et le bloc
   « déplacements » ne s'affichent QUE pour un detailer qui se déplace (à domicile / mobile) ; pour un detailer en atelier, pas de carte.
   Réutiliser le réglage existant qui indique domicile / atelier (sinon le déduire de la présence de frais de déplacement).
4. Aucune fonctionnalité retirée ; aucun autre client ni site personnalisé impacté (Cleanyzer, Spirit ACS, JustClean…).

## Sobriété (consigne de Clément)
Lot efficace : reprendre le code de GroomFlow plutôt que réinventer, pas d'exploration inutile du dépôt.

## Vérification
- Tests : la recherche « horaires » mène au réglage Horaires ; detailer atelier → pas de carte ; detailer mobile → carte affichée ;
  tous les anciens liens fonctionnent.
- Captures mobile (390 px) et ordinateur : Aujourd'hui, Plus, recherche, bouton (+). Aucune mention d'IA visible par les clients.
