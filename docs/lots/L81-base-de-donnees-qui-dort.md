# L81 — URGENT — Laisser la base de données s'endormir (quota Neon à 92 %)

Risque : faible (fréquence des tâches automatiques). Aucune migration, aucun paiement modifié.

## Constat (24/11)
Neon : 92,3 % du temps de calcul du mois utilisé alors que la plateforme a peu de trafic. Cause : `vercel.json` lance
`/api/cron/customer-subscription-emails` toutes les 5 minutes et `/api/cron/notifications` toutes les 15 minutes.
Chaque appel interroge la base, et Neon ne s'endort qu'après 5 minutes sans requête : la base ne dort donc JAMAIS
(≈ 730 h de calcul par mois). À 100 %, Neon suspend la base : tous les sites et réservations tombent.

## À faire
1. E-mails des abonnements clients : après chaque mise en file d'un e-mail (là où l'outbox est alimentée), déclencher
   tout de suite l'envoi (même fonction `drainCustomerSubscriptionOutbox`, limitée aux messages du tenant concerné ou petite limite),
   sans bloquer la réponse en cas d'échec. Le cron passe de `*/5 * * * *` à `0 * * * *` (filet de sécurité horaire).
2. Notifications (rappels au pro 1 h / 2 h / 24 h, demandes d'avis) : cron de `*/15 * * * *` à `*/30 * * * *`.
   Vérifier que la fenêtre de sélection des rappels couvre 30 minutes (aucun rappel sauté, aucun envoyé deux fois).
3. Rien d'autre ne change (reminders quotidien inchangé). Idempotence de l'outbox conservée.

## Vérification
- Tests : envoi immédiat après mise en file ; cron horaire ne renvoie pas un e-mail déjà parti ; rappels avec pas de 30 min
  (bornes : RDV à +59 min, +61 min, +2 h, +24 h) ni sauté ni doublé.
- Aucune mention d'IA ni de Claude visible.
