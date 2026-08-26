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
--      (aucune facture historique n'est transformée en avoir) et
--      originalInvoiceItemId reste NULL (lignes de factures classiques).
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

-- --- invoice_items : rattachement d'une ligne d'avoir à sa ligne d'origine ---
--  Permet de plafonner côté serveur les quantités/montants crédités PAR LIGNE,
--  y compris avec plusieurs avoirs partiels. NULL pour toutes les lignes de
--  factures classiques et pour d'éventuels avoirs legacy.
ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "originalInvoiceItemId" integer;

-- Index de lecture (lignes de factures existantes + rattachement d'avoirs).
CREATE INDEX IF NOT EXISTS "invoice_items_invoiceId_idx"
  ON "invoice_items" ("invoiceId");
CREATE INDEX IF NOT EXISTS "invoice_items_original_item_idx"
  ON "invoice_items" ("originalInvoiceItemId");

-- --- settings : compteur de numérotation INDÉPENDANT des avoirs ---------------
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNotePrefix" text NOT NULL DEFAULT 'AVO';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNoteCounter" integer NOT NULL DEFAULT 0;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "creditNoteCounterYear" integer NOT NULL DEFAULT 0;

COMMIT;
