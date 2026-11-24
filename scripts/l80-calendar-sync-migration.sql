-- ============================================================================
--  DetailFlow — LOT L80 : synchro agenda du téléphone
--
--  Migration ADDITIVE et IDEMPOTENTE (IF NOT EXISTS) : aucun DROP, RENAME ni
--  changement de type. NON exécutée automatiquement : à appliquer à la main
--  (Preview d'abord, branche de sauvegarde Neon avant la prod).
--
--  - calendar_sync_settings : 1 ligne par société (jeton du flux + adresse externe + statut)
--  - calendar_external_blocks : créneaux occupés lus (début/fin uniquement)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "calendar_sync_settings" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "feedToken" text NOT NULL,
  "externalUrl" text,
  "lastSyncAt" timestamp,
  "lastSuccessAt" timestamp,
  "lastError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_sync_settings_companyId_idx"
  ON "calendar_sync_settings" ("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_sync_settings_feedToken_idx"
  ON "calendar_sync_settings" ("feedToken");

CREATE TABLE IF NOT EXISTS "calendar_external_blocks" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "startsAt" timestamp with time zone NOT NULL,
  "endsAt" timestamp with time zone NOT NULL,
  "allDay" boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "calendar_external_blocks_companyId_idx"
  ON "calendar_external_blocks" ("companyId");
