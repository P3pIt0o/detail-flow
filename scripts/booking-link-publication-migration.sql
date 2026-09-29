-- ============================================================================
-- Lien de réservation autonome + publication du site public + modes tarifaires
-- ----------------------------------------------------------------------------
-- 1) companies.customSitePublished  (boolean, défaut TRUE)
--      FALSE => le site personnalisé (customSiteKey) n'est PAS rendu en public ;
--               le travail est conservé, le site standard reste servi.
-- 2) companies.bookingLinkEnabled   (boolean, défaut TRUE)
--      Active / désactive le lien autonome /book/{slug}.
-- 3) options.pricingMode / priceMaxCents / compareAtPriceCents / unitLabel
--      Métadonnées tarifaires : "fixed" | "per_unit" | "range" | "quote".
-- 4) services.pricingMode : "fixed" | "quote" (ex. formule Diamond sur mesure).
--
-- SÛRETÉ : purement additif. Les DEFAULT TRUE conservent EXACTEMENT le
-- comportement actuel de tous les tenants (site publié, lien actif). Colonnes
-- tarifaires NULLABLES (NULL = comportement historique "fixed").
-- IDEMPOTENT : ADD COLUMN IF NOT EXISTS.
-- NE PAS exécuter automatiquement : application manuelle sur Neon.
-- ============================================================================

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "customSitePublished" boolean NOT NULL DEFAULT true;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bookingLinkEnabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "options" ADD COLUMN IF NOT EXISTS "pricingMode" text;
ALTER TABLE "options" ADD COLUMN IF NOT EXISTS "priceMaxCents" integer;
ALTER TABLE "options" ADD COLUMN IF NOT EXISTS "compareAtPriceCents" integer;
ALTER TABLE "options" ADD COLUMN IF NOT EXISTS "unitLabel" text;

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "pricingMode" text;
