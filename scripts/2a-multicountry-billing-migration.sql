-- ============================================================================
--  LOT 2A — Facturation multi-pays : migration ADDITIVE (à exécuter MANUELLEMENT)
-- ============================================================================
--  100 % additive et rétrocompatible :
--   - uniquement des ADD COLUMN IF NOT EXISTS, toutes NULLABLE ;
--   - AUCUN DROP / TRUNCATE / RENAME / UPDATE massif ;
--   - `invoiceSiret` et toutes les données existantes sont PRÉSERVÉS ;
--   - les tenants existants restent valides (nouvelles colonnes = NULL).
--
--  NE PAS exécuter automatiquement. À jouer sur Neon après validation.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1) settings : identité légale vendeur multi-pays
-- ---------------------------------------------------------------------------
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "legalRegistrationNumber" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "legalRegistrationScheme" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "vatNumber" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "vatStatus" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "legalForm" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "frBusinessCategory" text;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "defaultCurrency" text;
-- Confirmation explicite du profil de facturation (pays + infos légales).
-- NULL => pays/devise = valeurs historiques, PAS un choix confirmé du pro.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "billingProfileConfirmedAt" timestamp;

-- ---------------------------------------------------------------------------
--  2) clients : modèle B2C/B2B + identité client selon SON pays
-- ---------------------------------------------------------------------------
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "customerType" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "legalRegistrationNumber" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "legalRegistrationScheme" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "vatNumber" text;

-- ---------------------------------------------------------------------------
--  3) invoices : devise + snapshots vendeur/client multi-pays (figés à l'émission)
-- ---------------------------------------------------------------------------
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "currencyCode" text;
-- Snapshot client
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customerType" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customerCountry" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customerLegalRegistrationNumber" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customerLegalRegistrationScheme" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "customerVatNumber" text;
-- Snapshot vendeur
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuerCountry" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuerLegalRegistrationNumber" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuerLegalRegistrationScheme" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "issuerVatNumber" text;
