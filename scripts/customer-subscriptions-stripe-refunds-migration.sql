-- Customer subscriptions — remboursements maintenance (Stripe Connect Direct Charges).
-- ADDITIVE, IDEMPOTENTE. PREVIEW UNIQUEMENT : ne pas exécuter en Production sans revue.
-- Aucune table Booking (payments / refunds) n'est touchée.

-- Cible des FK composites (garantit remboursement ∈ paiement ∈ abonnement ∈ tenant).
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_payments_company_subscription_id_key"
  ON "maintenance_payments" ("companyId", "subscriptionId", "id");

CREATE TABLE IF NOT EXISTS "maintenance_refunds" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE RESTRICT,
  "subscriptionId" integer NOT NULL,
  "maintenancePaymentId" integer NOT NULL,
  "provider" text NOT NULL DEFAULT 'stripe',
  "providerAccountId" text NOT NULL,
  "externalRefundId" text NOT NULL,
  "amountCents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'EUR',
  "reason" text,
  -- pending | requires_action | succeeded | failed | canceled
  "status" text NOT NULL DEFAULT 'pending',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "succeededAt" timestamp,
  "failedAt" timestamp,
  "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "maintenance_refunds_payment_fk" FOREIGN KEY ("companyId", "subscriptionId", "maintenancePaymentId")
    REFERENCES "maintenance_payments" ("companyId", "subscriptionId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_refunds_subscription_fk" FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES "maintenance_subscriptions" ("companyId", "id") ON DELETE RESTRICT,
  CONSTRAINT "maintenance_refunds_amount_non_negative" CHECK ("amountCents" >= 0),
  CONSTRAINT "maintenance_refunds_status_valid" CHECK ("status" IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  CONSTRAINT "maintenance_refunds_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$')
);

-- Idempotence webhook : un remboursement provider = une ligne, scopée par compte connecté.
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_refunds_external_refund_key"
  ON "maintenance_refunds" ("provider", "providerAccountId", "externalRefundId");
CREATE INDEX IF NOT EXISTS "maintenance_refunds_company_payment_idx"
  ON "maintenance_refunds" ("companyId", "maintenancePaymentId");
