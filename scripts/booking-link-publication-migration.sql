-- ============================================================================
-- Publication indépendante du site personnalisé + lien de réservation autonome
-- ----------------------------------------------------------------------------
-- 1) companies."customSitePublished"  boolean NOT NULL DEFAULT true
--      FALSE => le site personnalisé (customSiteKey) n'est PAS rendu en public ;
--               code, données et preview conservés, site standard servi.
--      DEFAULT true : les sites personnalisés déjà en ligne restent en ligne.
-- 2) companies."bookingLinkEnabled"   boolean NOT NULL DEFAULT false
--      Active le lien autonome /book/{slug}. DEFAULT false : AUCUN lien n'est
--      publié par la migration ; activation explicite depuis le Super Admin.
--      Même activé, le lien reste en 404 pour une entreprise SUSPENDED/ARCHIVED.
--
-- SÛRETÉ : purement additif (aucun DROP, aucun UPDATE de données).
-- IDEMPOTENT : ADD COLUMN IF NOT EXISTS ; le SET DEFAULT réaffirme le défaut
-- sûr sans toucher aux valeurs déjà enregistrées.
-- NE PAS exécuter automatiquement : application manuelle.
-- ============================================================================

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "customSitePublished" boolean NOT NULL DEFAULT true;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bookingLinkEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "companies" ALTER COLUMN "bookingLinkEnabled" SET DEFAULT false;
