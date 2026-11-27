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

## Décision de Clément (26/11, 12 h 30) — les 3 tests « d'autres parties » qui cassent
Ces tests cassent parce que ce lot ajoute une tâche planifiée (`vercel.json`) et des tables (`lib/db/schema.ts`) : les tests existants
qui listent exactement les crons de `vercel.json` ou les tables du schéma doivent être mis à jour pour inclure calendar-sync et les
nouvelles tables, SANS changer ce qu'ils vérifient d'autre. Identifier les 3 tests avec `verify`, les corriger ainsi, puis relancer.
Si un des 3 ne concerne ni les crons ni le schéma, le corriger seulement s'il est cassé par ce lot ; sinon le noter comme « déjà cassé avant » dans le rapport et continuer.
Limite de lecture d'un agenda externe : 10 Mo (décision déjà prise).

## Décision de Clément (26/11 11:02) — tranchée par Apollon par délégation
**Décision : passer la limite de lecture à 10 Mo** (`MAX_BYTES = 10 * 1024 * 1024` dans `lib/calendar-sync/safe-fetch.ts`), sans changer les délais (8 s / 20 s), les protections d'adresse, les plafonds d'analyse ni les messages d'erreur. Mettre à jour le commentaire, les « 2 Mo » du plan et de `tests/l80-safe-fetch.test.ts`, et ajouter un test qui lit et analyse un agenda de plus de 2 Mo ; cette décision vaut accord métier pour remplacer le « 2 Mo » du plan, sans contourner la ré-approbation si la garde la demande.

## Délégation de Clément (26/11)
Si une décision métier manque, ne t arrête pas : prends l option la plus logique et la plus prudente (celle que tu proposerais), écris-la dans ton rapport sous « Décisions prises par délégation », et continue jusqu au bout. Seules exceptions : n invente jamais un prix, un montant, un taux, une commission, une remise ou une durée d essai (reprends une valeur existante). Clément relit avant de fusionner.

## Décision de Clément (26/11 20:36) — tranchée par Apollon par délégation
**Décision (par délégation) :** dans `syncErrorMessage` (`lib/calendar-sync/ics-feed.ts`), pour `invalid_url`, `blocked_host` et `redirects`, ajouter à la fin du message actuel la phrase « Vos derniers créneaux restent pris en compte. », avec un test pour ces trois codes ; ne pas toucher à `linkErrorMessage` ni aux autres messages, et ne pas ajouter la durée de panne ou l'heure prévues dans l'aperçu (écart accepté, la ligne « Dernière mise à jour il y a… » suffit).
Cette décision remplace, pour ce seul message, l'interdiction du plan de changer les messages d'erreur : la noter sous « Décisions prises par délégation » et, si la garde demande une ré-approbation, la demander sans la contourner.
