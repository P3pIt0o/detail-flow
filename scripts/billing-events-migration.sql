-- ============================================================================
--  DetailFlow — Idempotence du webhook Stripe BILLING (abonnements)
--
--  Migration STRICTEMENT ADDITIVE et IDEMPOTENTE :
--    - une seule table nouvelle, aucune donnée existante modifiée ;
--    - IF NOT EXISTS partout : ré-exécutable sans effet de bord.
--
--  Une ligne n'est insérée qu'APRÈS le traitement RÉUSSI d'un événement
--  d'abonnement (jamais avant) : un échec transitoire laisse Stripe réessayer.
--  Les événements Lifetime ne passent PAS par cette table (flux inchangé).
--
--  À appliquer MANUELLEMENT après revue, d'abord sur la branche Preview.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "billing_events" (
  "eventId" text PRIMARY KEY,
  "eventType" text NOT NULL,
  "processedAt" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "billing_events_processedAt_idx"
  ON "billing_events" ("processedAt");
