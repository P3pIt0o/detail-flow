-- Migration ADDITIVE et rétrocompatible : source des avis par tenant.
--
-- À NE PAS exécuter automatiquement. À appliquer manuellement sur Neon après
-- validation. Idempotente : peut être rejouée sans risque.
--
-- Effet :
--   * ajoute settings.reviews_source ('manual' | 'google'), défaut 'manual' ;
--   * ajoute settings.google_place_id (Place ID sélectionné, nullable).
--
-- Rétrocompatibilité : tous les tenants existants passent à 'manual' (NOT NULL
-- DEFAULT 'manual'), soit le comportement actuel. Aucune donnée n'est modifiée
-- ni supprimée. Aucun texte/auteur/note d'avis Google n'est stocké : seul le
-- Place ID est conservé.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS reviews_source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- Garantit une valeur cohérente pour d'éventuelles lignes historiques.
UPDATE settings SET reviews_source = 'manual' WHERE reviews_source IS NULL;

-- Contrainte de domaine (idempotente) : n'accepter que 'manual' ou 'google'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settings_reviews_source_check'
  ) THEN
    ALTER TABLE settings
      ADD CONSTRAINT settings_reviews_source_check
      CHECK (reviews_source IN ('manual', 'google'));
  END IF;
END $$;
