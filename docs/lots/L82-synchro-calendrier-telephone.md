# L82 — URGENT — Synchronisation avec le calendrier du téléphone (reprise propre de L80)

## Pourquoi ce lot (25/11)
L80 est presque terminé mais sa branche `lot/L80-synchro-calendrier-telephone` est partie d'une base périmée et contient aussi
le travail Cleanyzer de L79 : la vérification échoue pour des raisons sans rapport. Ce lot repart de `main` à jour et reprend
UNIQUEMENT le travail calendrier de L80. Lot lié à Cleanyzer (demande de Tom) : l'accord de Clément est demandé avant de coder.
- Code de départ à récupérer depuis la branche L80 (`git checkout lot/L80-synchro-calendrier-telephone -- <fichier>`) :
  `lib/calendar-sync/`, `app/api/cron/calendar-sync/`, `app/admin/(dashboard)/mon-agenda/`, `components/admin/calendar-sync-panel.tsx`,
  `scripts/l80-calendar-sync-migration.sql`, `tests/l80-*.test.ts` ; aperçu : reprendre `.lot-state/L80.apercu.html` (décision déjà validée).
- Fichiers partagés (`lib/db/schema.ts`, `lib/booking/availability.ts`, `lib/admin/nav.ts`, `app/admin/(dashboard)/calendrier/page.tsx`,
  `vercel.json`) : NE PAS les recopier depuis L80 (ils écraseraient des changements récents de main) ; y réappliquer seulement les ajouts
  calendrier, en comparant avec `git diff main...lot/L80-synchro-calendrier-telephone -- <fichier>`.
- Interdit dans ce lot : tout fichier `components/custom-sites/cleanyzer/` et les tests l35/l79 (travail Cleanyzer déjà fusionné).
- Test des crons Vercel existant : y ajouter la tâche calendar-sync (le lot en ajoute une, c'est voulu).


Risque : moyen (disponibilités de réservation de tous les tenants). Migration additive.

## Demande (Tom, Cleanyzer, 24/11 — besoin général des detailers)
« Est-ce que c'est en lien avec mon calendrier iPhone ? Sinon les gens vont réserver alors que je ne suis pas dispo. »
Aujourd'hui DetailFlow ne génère qu'un fichier .ics par rendez-vous (`lib/booking/v2.ts`) : aucune synchro.

## À faire
1. **DetailFlow → téléphone** : adresse d'abonnement privée (`webcal://…/api/calendar/<jeton>.ics`) listant les rendez-vous
   à venir du tenant (client, prestation, adresse, téléphone). Jeton long aléatoire, régénérable (l'ancien cesse de marcher),
   jamais d'identifiant d'entreprise dans l'adresse. Bouton « Ajouter à mon iPhone » / « Ajouter à Google Agenda ».
2. **Téléphone → DetailFlow** : le detailer colle l'adresse privée de son agenda (iCloud « calendrier public » ou adresse
   secrète iCal de Google Agenda). Le serveur la relit toutes les 15 min (cache), et chaque événement « occupé » bloque
   les créneaux correspondants dans `getAvailability` (comme les congés). Seuls début/fin sont gardés, jamais le titre
   ni la description. Adresse validée (https/webcal uniquement, pas d'adresse interne ni d'IP privée, taille et délai limités).
3. Écran dans « Plus → Mon agenda » (pas de nouvelle entrée de menu principal) : deux étapes illustrées, mode d'emploi
   iPhone (Réglages → Calendrier → Comptes → Ajouter un abonnement) et Google, état « Dernière mise à jour il y a X min ».
4. En cas d'échec de lecture : les réservations continuent avec les dernières données connues + message clair dans l'admin.

## Droits par plan
Décision de Clément (24/11) : URGENT, pour TOUS les detailers, tous les plans. Aucune restriction par plan.

## Avant de coder
Aperçu `.lot-state/L80.apercu.html` (écran mobile « Mon agenda » + créneau bloqué côté réservation).

## Vérification
- Tests : événement externe bloque le créneau ; titre jamais stocké ; jeton régénéré invalide l'ancien ; adresse interne refusée ;
  isolation tenant A / tenant B (flux et blocages).
- Migration additive, idempotente, non exécutée. Aucune mention d'IA ni de Claude visible.
