-- ============================================================================
-- Publication indépendante du site personnalisé + lien de réservation autonome
-- ----------------------------------------------------------------------------
-- Les deux réglages sont OPT-IN : DEFAULT false pour toute nouvelle entreprise.
--
-- 1) companies."customSitePublished"  boolean NOT NULL DEFAULT false
--      FALSE => le site personnalisé (customSiteKey) n'est PAS rendu en public.
--      RÉTROCOMPATIBILITÉ : au moment où la colonne est CRÉÉE (et seulement à ce
--      moment), elle est initialisée à true pour les entreprises dont le site
--      personnalisé est RÉELLEMENT servi aujourd'hui, selon la règle exacte du
--      code avant migration (lib/custom-sites/server.ts + meta.ts) :
--        - customSiteKey (trim) = clé enregistrée : 'spirit-acs' | 'rozan'
--          ('cleanyzer' exclu : site en cours, doit rester non publié) ;
--        - statut ACTIVE ou BETA (SUSPENDED/ARCHIVED : aucune publication auto) ;
--        - slug <> 'cleanyzer'.
--      Toutes les autres entreprises restent à false.
-- 2) companies."bookingLinkEnabled"   boolean NOT NULL DEFAULT false
--      AUCUN lien /book/{slug} n'est publié par la migration.
--
-- SÛRETÉ : aucun DROP / DELETE / TRUNCATE. La seule écriture initialise la
-- NOUVELLE colonne ; aucune autre colonne ni table n'est modifiée.
-- IDEMPOTENT : l'initialisation n'a lieu que si la colonne n'existait pas. Une
-- relance ne republie jamais un site dépublié depuis le Super Admin.
-- NE PAS exécuter automatiquement : application manuelle.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'companies'
      AND column_name = 'customSitePublished'
  ) THEN
    ALTER TABLE "companies" ADD COLUMN "customSitePublished" boolean NOT NULL DEFAULT false;

    UPDATE "companies"
       SET "customSitePublished" = true
     WHERE btrim(coalesce("customSiteKey", '')) IN ('spirit-acs', 'rozan')
       AND "status" IN ('ACTIVE', 'BETA')
       AND lower(btrim("slug")) <> 'cleanyzer';
  END IF;
END
$$;

ALTER TABLE "companies" ALTER COLUMN "customSitePublished" SET DEFAULT false;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bookingLinkEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "companies" ALTER COLUMN "bookingLinkEnabled" SET DEFAULT false;

COMMIT;
