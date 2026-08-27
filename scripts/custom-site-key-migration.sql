-- ============================================================================
-- Sites personnalisés — clé technique par entreprise (additif)
-- ----------------------------------------------------------------------------
-- Ajoute une colonne TEXT NULLABLE sur "companies" :
--   customSiteKey : clé technique d'un site public entièrement personnalisé
--                   (ex. "spirit-acs"). Facultatif.
--
-- Sémantique applicative :
--   - NULL           => site standard DetailFlow (comportement historique).
--   - clé enregistrée => site personnalisé correspondant (lib/custom-sites).
--   - clé inconnue    => repli automatique sur le site standard (jamais de 404
--                        ni d'écran cassé en production).
--
-- SÛRETÉ : purement additif. Aucune donnée existante n'est modifiée :
--   - aucun UPDATE / backfill
--   - aucun DEFAULT
--   - aucun NOT NULL
--   - aucun DROP
--   - aucun enum PostgreSQL
-- Toutes les entreprises existantes conservent NULL => site standard inchangé.
--
-- IDEMPOTENT : "ADD COLUMN IF NOT EXISTS" peut être rejoué sans effet de bord.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit
-- du diff et AVANT tout merge dans main.
-- ============================================================================

ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "customSiteKey" text;
