-- ============================================================================
--  DetailFlow — LOT S2.5A : inventaire réel des licences Lifetime (50 max)
--
--  Migration STRICTEMENT ADDITIVE et IDEMPOTENTE :
--    - aucun DROP, aucun RENAME, aucun UPDATE de tenants existants ;
--    - aucune colonne ajoutée à "companies" ;
--    - IF NOT EXISTS / CREATE OR REPLACE / blocs DO : ré-exécutable.
--
--  Garanties portées PAR LA DB (indépendantes du code applicatif) :
--    1. Plafond absolu de 50 allocations consommant le stock
--       (ACTIVE, ou RESERVED dont reservationExpiresAt > now()), vérifié par
--       trigger sous verrou transactionnel pg_advisory_xact_lock : deux
--       transactions concurrentes ne peuvent jamais produire la 51e.
--    2. Au plus une allocation ouverte (RESERVED/ACTIVE) par entreprise.
--    3. Une allocation ACTIVE ne peut ni changer de statut ni être supprimée.
--    4. Suppression d'un tenant => companyId passe à NULL, la licence vendue
--       reste comptabilisée (companyNameSnapshot conserve une trace lisible).
--
--  Aucun paiement, aucun appel Stripe. À appliquer MANUELLEMENT après revue.
-- ============================================================================

/* -------- 1. Table d'inventaire ------------------------------------------ */
CREATE TABLE IF NOT EXISTS "lifetime_license_allocations" (
  "id" serial PRIMARY KEY,
  "companyId" integer REFERENCES "companies" ("id") ON DELETE SET NULL,
  "companyNameSnapshot" text,
  "status" text NOT NULL,
  "paymentPlan" text NOT NULL,
  "reservedAt" timestamp NOT NULL DEFAULT now(),
  "reservationExpiresAt" timestamp,
  "activatedAt" timestamp,
  "releasedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "lifetime_license_allocations_status_check"
    CHECK ("status" IN ('RESERVED', 'ACTIVE', 'RELEASED')),
  CONSTRAINT "lifetime_license_allocations_paymentPlan_check"
    CHECK ("paymentPlan" IN ('single', 'split_2x')),
  -- Cohérence état / horodatages.
  CONSTRAINT "lifetime_license_allocations_state_timestamps_check"
    CHECK (
      ("status" <> 'RESERVED' OR "reservationExpiresAt" IS NOT NULL)
      AND ("status" <> 'ACTIVE' OR "activatedAt" IS NOT NULL)
      AND ("status" <> 'RELEASED' OR "releasedAt" IS NOT NULL)
    )
);

/* -------- 2. Index ----------------------------------------------------- */
-- Une seule allocation ouverte par entreprise. Les réservations expirées sont
-- passées en RELEASED par le service avant toute nouvelle réservation.
CREATE UNIQUE INDEX IF NOT EXISTS "lifetime_license_allocations_company_open_key"
  ON "lifetime_license_allocations" ("companyId")
  WHERE "status" IN ('RESERVED', 'ACTIVE') AND "companyId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "lifetime_license_allocations_companyId_idx"
  ON "lifetime_license_allocations" ("companyId");

CREATE INDEX IF NOT EXISTS "lifetime_license_allocations_status_expires_idx"
  ON "lifetime_license_allocations" ("status", "reservationExpiresAt");

/* -------- 3. Garde DB : plafond 50 + immutabilité ACTIVE ------------------ */
CREATE OR REPLACE FUNCTION "lifetime_license_allocations_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  consumed integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ACTIVE' THEN
      RAISE EXCEPTION 'LIFETIME_ACTIVE_IMMUTABLE: une licence Lifetime ACTIVE ne peut pas être supprimée'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'ACTIVE' AND NEW."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'LIFETIME_ACTIVE_IMMUTABLE: une licence Lifetime ACTIVE ne peut pas être libérée'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" = 'ACTIVE'
     OR (NEW."status" = 'RESERVED' AND NEW."reservationExpiresAt" > now()) THEN
    -- En REPEATABLE READ le recomptage verrait un instantané figé : refus.
    IF current_setting('transaction_isolation') = 'repeatable read' THEN
      RAISE EXCEPTION 'LIFETIME_ISOLATION_UNSUPPORTED: utiliser READ COMMITTED ou SERIALIZABLE'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Sérialise toutes les écritures consommant le stock. Après obtention du
    -- verrou, la requête suivante prend un nouvel instantané (READ COMMITTED)
    -- et voit les allocations validées par les transactions concurrentes.
    PERFORM pg_advisory_xact_lock(hashtext('detailflow:lifetime_license_inventory'));

    EXECUTE format(
      'SELECT count(*) FROM %I.%I
        WHERE "id" <> $1
          AND ("status" = ''ACTIVE''
               OR ("status" = ''RESERVED'' AND "reservationExpiresAt" > now()))',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) INTO consumed USING NEW."id";

    IF consumed >= 50 THEN
      RAISE EXCEPTION 'LIFETIME_CAP_REACHED: plafond de 50 licences Lifetime atteint'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'lifetime_license_allocations_guard_trg'
      AND tgrelid = '"lifetime_license_allocations"'::regclass
  ) THEN
    CREATE TRIGGER "lifetime_license_allocations_guard_trg"
      BEFORE INSERT OR UPDATE OR DELETE ON "lifetime_license_allocations"
      FOR EACH ROW EXECUTE FUNCTION "lifetime_license_allocations_guard"();
  END IF;
END $$;
