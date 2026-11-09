-- ============================================================================
-- Formules d'abonnement — catégorie de véhicule facultative (additif) — LOT L36
-- ----------------------------------------------------------------------------
-- Ajoute la colonne INTEGER NULLABLE "vehicleTypeId" sur "maintenance_plans" :
--   NULL      = formule valable pour toutes les catégories (comportement actuel) ;
--   non NULL  = catégorie du même tenant (contrôlé côté application). Les formules
--               publiques de même nom avec des catégories différentes sont
--               regroupées en une seule carte sur la page publique.
-- Suppression d'une catégorie : la formule repasse à NULL (ON DELETE SET NULL).
--
-- SÛRETÉ : purement additif. Aucun UPDATE / backfill, aucun DEFAULT, aucun NOT NULL.
-- Idempotent : rejouable sans effet (IF NOT EXISTS).
-- Le code tolère l'absence de la colonne (lib/customer-subscriptions/plan-vehicle-type.ts).
-- À appliquer à la main : Preview d'abord, puis production.
-- ============================================================================

ALTER TABLE "maintenance_plans"
  ADD COLUMN IF NOT EXISTS "vehicleTypeId" integer REFERENCES "vehicle_types"("id") ON DELETE SET NULL;
