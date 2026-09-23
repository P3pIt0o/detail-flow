-- ============================================================================
-- Lieu d'intervention — « Je me déplace » / « J'ai un atelier » (additif)
-- ----------------------------------------------------------------------------
-- 6 colonnes, toutes NULLABLES, SANS DEFAULT (ajout = opération de métadonnées,
-- aucune réécriture de table, aucune valeur existante modifiée) :
--
--   settings.mobile_service_enabled  boolean  NULL => déplacement ACTIVÉ (historique)
--   settings.workshop_enabled        boolean  NULL => atelier DÉSACTIVÉ
--   settings.workshop_address        text     adresse de l'atelier
--   settings.workshop_postal_code    text     code postal de l'atelier
--   settings.workshop_city           text     ville de l'atelier
--   bookings.location_type           text     'client' | 'workshop' ; NULL => historique (chez le client)
--
-- Contrainte : bookings_location_type_check
--   CHECK (location_type IS NULL OR location_type IN ('client','workshop'))
--   ajoutée NOT VALID puis VALIDATE (verrou léger, les lignes existantes sont
--   toutes NULL donc valides).
--
-- Ces colonnes ne sont volontairement PAS déclarées dans lib/db/schema.ts : le
-- code les lit/écrit en SQL paramétré et de façon défensive
-- (lib/booking/location.ts). Tant que ce fichier n'est pas appliqué, Booking V2
-- conserve exactement le comportement actuel (déplacement uniquement).
--
-- SÛRETÉ : aucun UPDATE, aucun DELETE, aucun DROP, aucun NOT NULL, aucun DEFAULT.
-- ATOMIQUE : tout ou rien (transaction). Si un verrou n'est pas obtenu en 5 s,
-- la transaction échoue proprement sans rien modifier : il suffit de relancer.
-- IDEMPOTENT : rejouable sans effet de bord.
--
-- Testé sur branche Neon temporaire (schéma Drizzle complet répliqué + données
-- historiques) : application, ré-application, intégrité des données, contrainte.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "mobile_service_enabled" boolean;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_enabled" boolean;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_address" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_postal_code" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_city" text;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "location_type" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_location_type_check'
      AND conrelid = '"bookings"'::regclass
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_location_type_check"
      CHECK ("location_type" IS NULL OR "location_type" IN ('client', 'workshop'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE "bookings" VALIDATE CONSTRAINT "bookings_location_type_check";

COMMIT;

-- ----------------------------------------------------------------------------
-- VÉRIFICATION (lecture seule, à exécuter après application) :
--
-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE (table_name = 'settings' AND column_name IN
--         ('mobile_service_enabled','workshop_enabled','workshop_address',
--          'workshop_postal_code','workshop_city'))
--    OR (table_name = 'bookings' AND column_name = 'location_type')
-- ORDER BY table_name, column_name;
--   => 6 lignes, is_nullable = 'YES', column_default = NULL
--
-- SELECT conname, convalidated FROM pg_constraint
-- WHERE conname = 'bookings_location_type_check';
--   => 1 ligne, convalidated = true
-- ----------------------------------------------------------------------------
