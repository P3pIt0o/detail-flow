-- =============================================================================
-- LOT 2 — CRM PROSPECTS (leads) : migration ADDITIVE, IDEMPOTENTE.
--
-- Ne contient AUCUN DROP / TRUNCATE / rename destructif. Peut être rejouée sans
-- effet de bord (IF NOT EXISTS partout). Le backfill des demandes personnalisées
-- historiques est réalisé par un script TypeScript FEATURE-AWARE et idempotent
-- (scripts/backfill-leads-from-custom-requests.ts) qui réutilise le helper
-- générique upsertLeadFromExternalSource et respecte canUseFeature(companyId,
-- "leads_crm"). On ne fait donc PAS de backfill non filtré ici.
-- =============================================================================

-- 1) Table des prospects ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "leads" (
  "id"                     serial PRIMARY KEY,
  "companyId"              integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status"                 text NOT NULL DEFAULT 'NEW',
  "source"                 text NOT NULL DEFAULT 'MANUAL',
  "contactName"            text NOT NULL,
  "email"                  text,
  "emailNormalized"        text,
  "phone"                  text,
  "phoneNormalized"        text,
  "vehicleType"            text,
  "vehicleBrand"           text,
  "vehicleModel"           text,
  "vehiclePlate"           text,
  "serviceInterest"        text,
  "internalSummary"        text,
  "lostReason"             text,
  "nextFollowUpAt"         timestamp,
  "contactedAt"            timestamp,
  "appointmentBookedAt"    timestamp,
  "convertedAt"            timestamp,
  "lostAt"                 timestamp,
  "linkedBookingId"        integer,
  "sourceExternalId"       text,
  "sourceChannel"          text,
  "campaignExternalId"     text,
  "campaignName"           text,
  "formExternalId"         text,
  "adExternalId"           text,
  "sourceMetadata"         jsonb,
  "createdAt"              timestamp NOT NULL DEFAULT now(),
  "updatedAt"              timestamp NOT NULL DEFAULT now()
);

-- 2) Table d'activité / historique -------------------------------------------
CREATE TABLE IF NOT EXISTS "lead_activities" (
  "id"               serial PRIMARY KEY,
  "companyId"        integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "leadId"           integer NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "type"             text NOT NULL,
  "message"          text,
  "metadata"         jsonb,
  "createdByUserId"  text,
  "createdAt"        timestamp NOT NULL DEFAULT now()
);

-- 3) Indexes utiles (sans sur-indexer) ---------------------------------------
CREATE INDEX IF NOT EXISTS "leads_companyId_idx"          ON "leads" ("companyId");
CREATE INDEX IF NOT EXISTS "leads_company_status_idx"     ON "leads" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "leads_company_createdAt_idx"  ON "leads" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "leads_company_followUp_idx"   ON "leads" ("companyId", "nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "leads_company_email_idx"      ON "leads" ("companyId", "emailNormalized");
CREATE INDEX IF NOT EXISTS "leads_company_phone_idx"      ON "leads" ("companyId", "phoneNormalized");

CREATE INDEX IF NOT EXISTS "lead_activities_leadId_idx"    ON "lead_activities" ("leadId");
CREATE INDEX IF NOT EXISTS "lead_activities_companyId_idx" ON "lead_activities" ("companyId");

-- 4) Idempotence des sources externes ----------------------------------------
-- Une même donnée externe (Meta Lead ID, ID custom_request…) ne crée jamais deux
-- prospects. Index UNIQUE PARTIEL : ne s'applique que lorsque sourceExternalId
-- est présent (les saisies manuelles sans id externe ne sont pas contraintes).
CREATE UNIQUE INDEX IF NOT EXISTS "leads_company_source_external_key"
  ON "leads" ("companyId", "source", "sourceExternalId")
  WHERE "sourceExternalId" IS NOT NULL;
