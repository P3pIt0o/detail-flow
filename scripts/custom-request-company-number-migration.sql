-- ============================================================================
-- Demande spéciale — numéro d'entreprise / identifiant légal (additif)
-- ----------------------------------------------------------------------------
-- Ajoute une colonne TEXT NULLABLE sur "custom_requests" :
--   customerLegalRegistrationNumber : identifiant légal libre saisi par le
--                                     prospect (BCE, SIREN/SIRET…). Facultatif.
--
-- SÛRETÉ : purement additif. Aucune donnée existante n'est modifiée :
--   - aucun UPDATE / backfill
--   - aucun DEFAULT
--   - aucun NOT NULL
--   - aucun enum PostgreSQL
-- Toutes les demandes existantes conservent NULL => comportement historique.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit
-- du diff et AVANT tout merge dans main.
-- ============================================================================

ALTER TABLE "custom_requests"
ADD COLUMN IF NOT EXISTS "customerLegalRegistrationNumber" text;
