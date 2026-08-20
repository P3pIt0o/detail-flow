-- ============================================================================
--  DetailFlow — Socle central des licences (Étape 1)
--
--  Migration STRICTEMENT ADDITIVE et IDEMPOTENTE.
--    - aucun DROP, aucun RENAME, aucun UPDATE de données existantes ;
--    - IF NOT EXISTS partout : ré-exécutable sans effet de bord ;
--    - les tenants existants gardent licensePlan = NULL => accès LEGACY
--      (comportement actuel conservé, voir lib/licensing/resolver.ts).
--
--  À appliquer manuellement APRÈS revue (non appliquée automatiquement).
-- ============================================================================

/* -------- 1. Colonnes de licence sur companies (nullable = LEGACY) --------- */
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "licensePlan" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "licenseGeneration" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "licenseAssignedAt" timestamp;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "licenseAssignedByUserId" text;

/* -------- 2. Overrides de fonctionnalités par entreprise ------------------- */
CREATE TABLE IF NOT EXISTS "company_feature_overrides" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "featureKey" text NOT NULL,
  "state" text NOT NULL,
  "source" text NOT NULL DEFAULT 'MANUAL',
  "expiresAt" timestamp,
  "internalNote" text,
  "createdByUserId" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Un seul override par (entreprise, feature) : empêche deux overrides
-- contradictoires (double clic / course).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_feature_overrides_company_feature_unique'
  ) THEN
    ALTER TABLE "company_feature_overrides"
      ADD CONSTRAINT "company_feature_overrides_company_feature_unique"
      UNIQUE ("companyId", "featureKey");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "company_feature_overrides_companyId_idx"
  ON "company_feature_overrides" ("companyId");

/* -------- 3. Journal d'audit léger (métadonnées non sensibles) ------------- */
CREATE TABLE IF NOT EXISTS "license_audit_log" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "actorUserId" text,
  "action" text NOT NULL,
  "metadata" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "license_audit_log_companyId_idx"
  ON "license_audit_log" ("companyId");
