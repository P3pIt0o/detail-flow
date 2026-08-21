-- ============================================================================
-- LOT 2B.4 — Traitement fiscal explicite (additif, backward-compatible)
-- ----------------------------------------------------------------------------
-- Ajoute deux colonnes TEXT NULLABLE sur "invoices" :
--   taxTreatment    : STANDARD | EXEMPT | REVERSE_CHARGE | OUT_OF_SCOPE | null
--   taxLegalMention : texte exact de la mention fiscale choisie pour la facture
--
-- SÛRETÉ : purement additif. Aucune donnée existante n'est modifiée :
--   - aucun UPDATE / backfill
--   - aucun DEFAULT
--   - aucun NOT NULL
--   - aucun enum PostgreSQL
-- Toutes les factures existantes conservent NULL => comportement historique.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit
-- du diff et AVANT tout merge dans main.
-- ============================================================================

ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "taxTreatment" text;

ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "taxLegalMention" text;
