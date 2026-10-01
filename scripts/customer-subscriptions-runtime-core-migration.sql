-- Abonnements clients — runtime core. Migration STRICTEMENT ADDITIVE.
-- Prérequis : scripts/customer-subscriptions-schema-migration.sql.
-- Uniquement ADD COLUMN IF NOT EXISTS / CREATE [UNIQUE] INDEX IF NOT EXISTS.
-- Non exécutée automatiquement.

-- Prestation récurrente incluse dans la formule (distincte de initialServiceId).
ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS "includedServiceId" integer REFERENCES services(id) ON DELETE SET NULL;

-- Contrat : prestation incluse + nom figé + clé d'idempotence de création.
ALTER TABLE maintenance_subscriptions
  ADD COLUMN IF NOT EXISTS "includedServiceId" integer REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE maintenance_subscriptions
  ADD COLUMN IF NOT EXISTS "includedServiceNameSnapshot" text;
ALTER TABLE maintenance_subscriptions
  ADD COLUMN IF NOT EXISTS "creationIdempotencyKey" text;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subscriptions_creation_idempotency_key
  ON maintenance_subscriptions ("companyId", "creationIdempotencyKey")
  WHERE "creationIdempotencyKey" IS NOT NULL;

-- Idempotence facture provider, scopée par compte provider.
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_payments_external_invoice_key
  ON maintenance_payments (provider, "providerAccountId", "externalInvoiceId")
  WHERE "externalInvoiceId" IS NOT NULL;
