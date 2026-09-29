-- ============================================================================
-- Lieu d'intervention — « Je me déplace » / « J'ai un atelier » (additif)
-- ----------------------------------------------------------------------------
-- Ajoute sur "settings" (niveau tenant) :
--   mobile_service_enabled : le pro se déplace chez ses clients.
--                            NULL => considéré comme ACTIVÉ (comportement actuel).
--   workshop_enabled       : le pro reçoit ses clients dans un atelier.
--                            NULL => considéré comme DÉSACTIVÉ.
--   workshop_address / workshop_postal_code / workshop_city : adresse atelier.
--
-- Ajoute sur "bookings" :
--   location_type : 'client' (chez le client) | 'workshop' (à l'atelier).
--                   NULL => réservation historique (chez le client).
--
-- La logique de déplacement existante (businessAddress, freeDistanceKm,
-- pricePerKmCents, maxDistanceKm, roundTrip) est RÉUTILISÉE telle quelle.
--
-- SÛRETÉ : purement additif — aucun UPDATE, aucun DEFAULT, aucun NOT NULL,
-- aucun DROP. Tant que ce fichier n'est pas appliqué, l'application lit les
-- colonnes de façon défensive (lib/booking/location.ts) et conserve EXACTEMENT
-- le comportement actuel (déplacement uniquement).
--
-- IDEMPOTENT : rejouable sans effet de bord.
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit.
-- ============================================================================

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "mobile_service_enabled" boolean;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_enabled" boolean;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_address" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_postal_code" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "workshop_city" text;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "location_type" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_location_type_check'
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_location_type_check"
      CHECK ("location_type" IS NULL OR "location_type" IN ('client', 'workshop'));
  END IF;
END $$;
