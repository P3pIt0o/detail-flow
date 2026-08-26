-- ============================================================================
--  Migration ADDITIVE : Avoirs (notes de crédit) — LOT invoice-credit-notes
-- ============================================================================
--  Rectification d'une facture émise par un avoir, SANS jamais modifier la
--  facture d'origine.
--
--  100 % ADDITIVE et RÉTROCOMPATIBLE :
--    - uniquement ADD COLUMN IF NOT EXISTS et CREATE INDEX IF NOT EXISTS ;
--    - aucun DROP, TRUNCATE, RENAME, UPDATE ni backfill ;
--    - toutes les colonnes ont une valeur par défaut sûre => les lignes
--      existantes deviennent automatiquement documentType='invoice'
--      (aucune facture historique n'est transformée en avoir).
--
--  À exécuter manuellement sur Neon (staging puis prod) APRÈS relecture.
--  NON exécutée par l'assistant.
-- ============================================================================

BEGIN;

-- --- invoices : nature du document + rattachement à la facture d'origine -----
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "documentType" text NOT NULL DEFAULT 'invoice';
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "originalInvoiceId" integer;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "creditReason" text;

-- Recherche des avoirs d'une facture d'origine, scopée par entreprise.
CREATE INDEX IF NOT EXISTS "invoices_company_original_idx"
  ON "invoices" ("companyId", "originalInvoiceId");

-- --- settings : compteur de numérotation INDÉPENDANT des avoirs ---------------
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNotePrefix" text NOT NULL DEFAULT 'AVO';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNoteCounter" integer NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNoteCounterYear" integer NOT NULL DEFAULT 0;

COMMIT;
