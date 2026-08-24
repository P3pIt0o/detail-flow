-- ============================================================================
--  MIGRATION ADDITIVE — Jeton public de gestion de rendez-vous (annulation
--  client depuis l'email / la page de confirmation).
-- ============================================================================
--  NON DESTRUCTIVE : ajoute une seule colonne nullable + un index unique.
--  Aucune donnée existante n'est modifiée. Les réservations historiques
--  gardent manageToken = NULL (le lien de gestion ne leur est pas proposé).
--
--  À EXÉCUTER MANUELLEMENT sur Neon après validation. NON exécutée par v0.
-- ============================================================================

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "manageToken" text;

-- Un jeton ne peut désigner qu'une seule réservation. Postgres autorise
-- plusieurs valeurs NULL dans un index unique : les lignes historiques
-- (manageToken NULL) ne sont donc jamais en conflit.
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_manageToken_idx"
  ON "bookings" ("manageToken");
