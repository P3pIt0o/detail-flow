-- ============================================================================
-- bookingDistributionMode : manière dont le tenant distribue son module de
-- réservation ("link" | "widget"). NE PAS EXÉCUTER sans validation explicite.
--
-- - Colonne NULLABLE, sans DEFAULT : les tenants existants restent NULL
--   → comportement historique strictement inchangé (Spirit ACS, Rozan, standards).
-- - Backfill UNIQUE : Cleanyzer (id 104 ET slug 'cleanyzer' ET customSiteKey
--   'cleanyzer') → 'widget'. Aucune autre ligne n'est touchée.
-- - Idempotent : ADD COLUMN IF NOT EXISTS, contrainte créée seulement si
--   absente, backfill limité aux valeurs encore NULL (ne réécrit jamais un
--   choix ultérieur).
-- - Aucune donnée métier modifiée. Aucun DROP / DELETE / TRUNCATE.
-- ============================================================================

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "bookingDistributionMode" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_booking_distribution_mode_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_booking_distribution_mode_check
      CHECK ("bookingDistributionMode" IN ('link', 'widget'));
  END IF;
END $$;

UPDATE companies
SET "bookingDistributionMode" = 'widget'
WHERE id = 104
  AND slug = 'cleanyzer'
  AND "customSiteKey" = 'cleanyzer'
  AND "bookingDistributionMode" IS NULL;

COMMIT;
