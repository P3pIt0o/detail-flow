-- Customer subscriptions — UI V1 : mode public, demandes, fins anticipées, outbox emails.
-- ADDITIVE, IDEMPOTENTE. PREVIEW UNIQUEMENT : ne pas exécuter en Production sans revue.
-- Aucun DROP, aucun changement de type, aucune table Booking / Billing SaaS touchée.

BEGIN;

-- 1. Source de vérité unique du mode public (site + widget). Défaut : disabled.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "customerSubscriptionPublicMode" text NOT NULL DEFAULT 'disabled';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_customer_subscription_public_mode_valid') THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_customer_subscription_public_mode_valid"
      CHECK ("customerSubscriptionPublicMode" IN ('disabled', 'request', 'direct'));
  END IF;
END $$;

-- 2. Demandes d'abonnement (une demande N'EST PAS un contrat).
CREATE TABLE IF NOT EXISTS "maintenance_subscription_requests" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "planId" integer NOT NULL,
  "customerId" integer,
  "customerName" text NOT NULL,
  "customerEmail" text NOT NULL,
  "customerPhone" text,
  "vehicleBrand" text NOT NULL,
  "vehicleModel" text NOT NULL,
  "vehiclePlate" text,
  "vehicleTypeName" text,
  "message" text,
  -- pending | accepted | rejected | expired
  "status" text NOT NULL DEFAULT 'pending',
  "submissionId" text NOT NULL,
  "planSnapshot" jsonb NOT NULL,
  "planSnapshotVersion" text NOT NULL,
  "convertedSubscriptionId" integer,
  "internalDecisionNote" text,
  "customerDecisionMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "acceptedAt" timestamp,
  "rejectedAt" timestamp,
  "expiresAt" timestamp,
  CONSTRAINT "maintenance_subscription_requests_plan_fk" FOREIGN KEY ("companyId", "planId")
    REFERENCES "maintenance_plans" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_subscription_requests_subscription_fk" FOREIGN KEY ("companyId", "convertedSubscriptionId")
    REFERENCES "maintenance_subscriptions" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_subscription_requests_status_valid"
    CHECK ("status" IN ('pending', 'accepted', 'rejected', 'expired')),
  CONSTRAINT "maintenance_subscription_requests_submission_len" CHECK (length("submissionId") BETWEEN 8 AND 100),
  CONSTRAINT "maintenance_subscription_requests_message_len" CHECK ("message" IS NULL OR length("message") <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_subscription_requests_submission_key"
  ON "maintenance_subscription_requests" ("companyId", "submissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_subscription_requests_company_id_key"
  ON "maintenance_subscription_requests" ("companyId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_subscription_requests_converted_key"
  ON "maintenance_subscription_requests" ("companyId", "convertedSubscriptionId")
  WHERE "convertedSubscriptionId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "maintenance_subscription_requests_company_status_idx"
  ON "maintenance_subscription_requests" ("companyId", "status");
CREATE INDEX IF NOT EXISTS "maintenance_subscription_requests_company_created_idx"
  ON "maintenance_subscription_requests" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "maintenance_subscription_requests_plan_idx"
  ON "maintenance_subscription_requests" ("planId");

-- 3. Demandes de fin anticipée (ne mutent NI Stripe NI le contrat).
CREATE TABLE IF NOT EXISTS "maintenance_cancellation_requests" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "subscriptionId" integer NOT NULL,
  -- pending | approved | rejected | withdrawn
  "status" text NOT NULL DEFAULT 'pending',
  "customerMessage" text,
  "internalDecisionNote" text,
  "customerDecisionMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "decidedAt" timestamp,
  CONSTRAINT "maintenance_cancellation_requests_subscription_fk" FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES "maintenance_subscriptions" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_cancellation_requests_status_valid"
    CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT "maintenance_cancellation_requests_message_len"
    CHECK ("customerMessage" IS NULL OR length("customerMessage") <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_cancellation_requests_company_id_key"
  ON "maintenance_cancellation_requests" ("companyId", "id");
-- Au plus UNE demande en attente par contrat (double clic → idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_cancellation_requests_one_pending_key"
  ON "maintenance_cancellation_requests" ("companyId", "subscriptionId") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "maintenance_cancellation_requests_company_status_idx"
  ON "maintenance_cancellation_requests" ("companyId", "status");

-- 4. Outbox emails abonnements (aucune adresse stockée : résolue depuis la ressource).
CREATE TABLE IF NOT EXISTS "maintenance_subscription_email_outbox" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "subscriptionId" integer,
  "requestId" integer,
  "cancellationRequestId" integer,
  "type" text NOT NULL,
  -- client | professional
  "recipientRole" text NOT NULL,
  "dedupeKey" text NOT NULL,
  -- pending | sending | sent | failed | skipped
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sendAt" timestamp NOT NULL DEFAULT now(),
  "claimedAt" timestamp,
  "sentAt" timestamp,
  "providerMessageId" text,
  "lastErrorCode" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "maintenance_subscription_email_outbox_subscription_fk" FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES "maintenance_subscriptions" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_subscription_email_outbox_request_fk" FOREIGN KEY ("companyId", "requestId")
    REFERENCES "maintenance_subscription_requests" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_subscription_email_outbox_cancellation_fk" FOREIGN KEY ("companyId", "cancellationRequestId")
    REFERENCES "maintenance_cancellation_requests" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_subscription_email_outbox_status_valid"
    CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  CONSTRAINT "maintenance_subscription_email_outbox_role_valid"
    CHECK ("recipientRole" IN ('client', 'professional')),
  CONSTRAINT "maintenance_subscription_email_outbox_type_format" CHECK ("type" ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT "maintenance_subscription_email_outbox_attempts_non_negative" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_subscription_email_outbox_dedupe_key"
  ON "maintenance_subscription_email_outbox" ("dedupeKey");
-- Claim du worker : lignes dues, partielles sur les statuts réclamables.
CREATE INDEX IF NOT EXISTS "maintenance_subscription_email_outbox_due_idx"
  ON "maintenance_subscription_email_outbox" ("sendAt") WHERE "status" IN ('pending', 'failed', 'sending');
CREATE INDEX IF NOT EXISTS "maintenance_subscription_email_outbox_company_subscription_idx"
  ON "maintenance_subscription_email_outbox" ("companyId", "subscriptionId");

COMMIT;
