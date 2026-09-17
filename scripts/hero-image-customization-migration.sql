-- ============================================================================
-- Personnalisation avancée de l'image Hero (tenants STANDARD).
--
-- Migration ADDITIVE et RÉTROCOMPATIBLE : uniquement des colonnes nullable,
-- sans DEFAULT et SANS backfill. Les tenants existants conservent EXACTEMENT
-- leur rendu actuel :
--   - heroImageUrl NULL      => fallback lib/tenant-hero.ts (image statique).
--   - colonnes de cadrage NULL => aucun override appliqué (rendu historique).
--   - heroOverlayOpacity NULL  => voile historique inchangé.
--
-- Aucune suppression, aucune modification destructive. Réexécutable sans risque
-- grâce à IF NOT EXISTS.
--
-- Bornes MÉTIER (validées CÔTÉ SERVEUR, jamais garanties par le frontend) :
--   heroPositionX / heroPositionY / heroMobilePositionX / heroMobilePositionY : 0..100 (50 = centré)
--   heroZoom / heroMobileZoom : 100..180 (100 = comportement actuel)
--   heroOverlayOpacity : 0..80
-- On N'ajoute PAS de CHECK constraint en base pour rester purement additif et
-- éviter tout risque sur des lignes existantes ; la validation est centralisée
-- dans lib/hero-customization.ts et appliquée par les Server Actions.
-- ============================================================================

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroImageUrl" text;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroPositionX" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroPositionY" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroZoom" integer;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroMobilePositionX" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroMobilePositionY" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroMobileZoom" integer;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "heroOverlayOpacity" integer;
