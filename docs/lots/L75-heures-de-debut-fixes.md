# L75 — Planning : heures de début fixes par jour (ex. samedi 8 h et 13 h, dimanche 8 h)

Risque : moyen (génération des créneaux de réservation, réglage par pro). Migration additive si besoin d'un champ, jamais exécutée en prod par le lot.

## Demande (client C'Clean Auto, 23/11/2026)
« Un créneau à 8 h le samedi et un autre à 13 h, et le dimanche juste 8 h. » Aujourd'hui les créneaux sont générés avec un « pas »
global (Paramètres → Planning & créneaux), pas d'heures de début précises par jour.

## À faire
- Paramètres → Horaires : pour chaque jour, option « Heures de début fixes » avec une liste d'heures (ex. 08:00, 13:00).
  Si l'option est active pour un jour, seuls ces départs sont proposés ce jour-là ; sinon le comportement actuel (pas global) reste inchangé.
- Un départ fixe n'est proposé que si la prestation choisie tient avant la fin des horaires du jour et ne chevauche pas un rendez-vous,
  un congé ou une plage bloquée (règles existantes réutilisées).
- Valable pour tous les pros ; aucun changement pour ceux qui n'activent pas l'option. Isolation stricte entre pros.
- Après fusion : régler C'Clean Auto (samedi 08:00 et 13:00, dimanche 08:00) — à faire par Clément depuis l'admin du pro ou par le pro.

## Vérification
- Tests : samedi [08:00,13:00] → seulement 8 h et 13 h ; dimanche [08:00] → seulement 8 h ; jour sans option → pas global inchangé ;
  départ fixe occupé ou dans un congé → non proposé.
- Captures admin + parcours de réservation. Aucune mention d'IA visible par les clients.

## Décision de Clément (23/11/2026)
applique toutes les corrections de la contre-expertise (filtre par pro à la sauvegarde, lecture tolérante si la colonne n'existe pas encore, captures prévues, tests base séparés)
Ne pas redemander cette décision.
