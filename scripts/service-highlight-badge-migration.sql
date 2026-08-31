-- ============================================================================
-- Prestations — badge « Mise en avant » (additif) — LOT C
-- ----------------------------------------------------------------------------
-- Ajoute deux colonnes TEXT NULLABLE sur "services" :
--   highlightKind  : type de badge parmi
--                    'bestseller' | 'most_booked' | 'recommended' | 'new' | 'custom'
--                    NULL = aucun badge (valeur par défaut, comportement actuel).
--   highlightLabel : libellé affiché quand highlightKind = 'custom'
--                    (≤ 30 caractères, texte échappé côté application).
--
-- SÛRETÉ : purement additif. Aucune donnée existante n'est modifiée :
--   - aucun UPDATE / backfill
--   - aucun DEFAULT
--   - aucun NOT NULL
--   - aucun enum PostgreSQL (simple text, validé côté application)
-- Toutes les prestations existantes conservent NULL => aucun badge affiché,
-- aucun changement de prix ni d'ordre.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit
-- du diff et AVANT tout merge dans main.
-- ============================================================================

ALTER TABLE "services"
ADD COLUMN IF NOT EXISTS "highlightKind" text;

ALTER TABLE "services"
ADD COLUMN IF NOT EXISTS "highlightLabel" text;
