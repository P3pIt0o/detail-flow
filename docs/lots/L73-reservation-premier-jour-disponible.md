# L73 — Réservation : le calendrier s'ouvre directement sur le premier jour disponible

Risque : faible (affichage du parcours de réservation, aucune donnée, aucun paiement, aucune migration). URGENT.

## Demande (client C'Clean Auto, 23/11/2026)
Son planning est complet jusqu'au 15 janvier (période « Congés » affichée « Complet »). Ses clients doivent cliquer
semaine après semaine sur « suivant » pour arriver au 16 janvier. Il veut que le client voie DIRECTEMENT la première date disponible.

## Constat
`components/booking-v2/step-datetime.tsx` : la fenêtre de dates part toujours d'aujourd'hui (`dateWindow(new Date(), offset, WINDOW_DAYS)`,
`offset` = 0). `firstAvailable` n'est cherché que dans la fenêtre affichée.

## À faire (pour TOUS les pros, pas seulement C'Clean Auto)
- À l'ouverture de l'étape date/heure, si aucun créneau n'est libre dans la fenêtre affichée, chercher côté serveur la première date
  disponible (dans la limite de réservation à l'avance déjà configurée, sinon 180 jours) et ouvrir directement la fenêtre qui la contient,
  avec ce jour présélectionné.
- Petit message au-dessus : « Prochaine disponibilité : jeudi 16 janvier » (date formatée en français).
- Les flèches précédent / suivant restent utilisables. Aucune disponibilité dans la limite : message « Aucune disponibilité pour le moment ».
- Respecter les congés, horaires, plages horaires et règles de délai existants (aucune règle de calcul des créneaux modifiée).
- Fonctionne aussi sur les sites personnalisés qui utilisent ce parcours (Cleanyzer, Spirit ACS, JustClean…).

## Vérification
- Tests : congés jusqu'à J+50 → le calendrier s'ouvre sur J+51 présélectionné ; dispo aujourd'hui → comportement actuel inchangé.
- Captures mobile et ordinateur. Aucune mention d'IA visible par les clients.

## Décision de Clément (23/11/2026)
applique toutes les corrections de la contre-expertise (plafond de recherche, test d'isolation entre pros, test de la flèche précédent, risque moyen)
Ne pas redemander cette décision.
