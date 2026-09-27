-- ============================================================================
--  DetailFlow — LOT S3A : traçabilité Stripe Checkout des licences Lifetime
-- ============================================================================
--  ADDITIF et IDEMPOTENT (ré-exécutable) :
--    - aucun DROP, aucun RENAME, aucun UPDATE de données ;
--    - uniquement 4 colonnes NULLABLES sur "lifetime_license_allocations"
--      + 2 index UNIQUES PARTIELS ;
--    - "companies" n'est PAS modifiée.
--  Prérequis : scripts/lifetime-license-allocation-migration.sql (LOT S2.5A).
--  NE PAS appliquer automatiquement : exécution manuelle contrôlée.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('lifetime_license_allocations') IS NULL THEN
    RAISE EXCEPTION 'Table lifetime_license_allocations absente : appliquer d''abord scripts/lifetime-license-allocation-migration.sql';
  END IF;
END
$$;

ALTER TABLE "lifetime_license_allocations" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" text;
ALTER TABLE "lifetime_license_allocations" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text;
ALTER TABLE "lifetime_license_allocations" ADD COLUMN IF NOT EXISTS "paidAmountCents" integer;
ALTER TABLE "lifetime_license_allocations" ADD COLUMN IF NOT EXISTS "paidAt" timestamp;

-- Une Checkout Session / un PaymentIntent ne peut appartenir qu'à UNE allocation.
CREATE UNIQUE INDEX IF NOT EXISTS "lifetime_license_allocations_checkout_session_key"
  ON "lifetime_license_allocations" ("stripeCheckoutSessionId")
  WHERE "stripeCheckoutSessionId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "lifetime_license_allocations_payment_intent_key"
  ON "lifetime_license_allocations" ("stripePaymentIntentId")
  WHERE "stripePaymentIntentId" IS NOT NULL;
