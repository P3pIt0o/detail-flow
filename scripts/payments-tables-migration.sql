-- Migration ADDITIVE : paiements en ligne (Stripe Connect V1).
-- Aucune suppression, aucune modification destructive. Idempotente.

-- 1. Colonnes paiement sur companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "paymentProvider" text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "stripeAccountId" text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "stripeDetailsSubmitted" boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "paymentsEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "paymentMode" text NOT NULL DEFAULT 'none';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "platformFeeBps" integer;

-- 2. Réglages plateforme (commission globale) — une seule ligne (id=1)
CREATE TABLE IF NOT EXISTS platform_settings (
  id integer PRIMARY KEY DEFAULT 1,
  "defaultPlatformFeeBps" integer NOT NULL DEFAULT 300,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id, "defaultPlatformFeeBps") VALUES (1, 300)
  ON CONFLICT (id) DO NOTHING;

-- 3. Paiements
CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "bookingId" integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  "externalPaymentId" text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'EUR',
  "grossAmountCents" integer NOT NULL,
  "platformFeeBps" integer NOT NULL,
  "platformFeeAmountCents" integer NOT NULL,
  "providerFeeAmountCents" integer,
  "netAmountCents" integer,
  "refundedAmountCents" integer NOT NULL DEFAULT 0,
  meta jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "paidAt" timestamp,
  "failedAt" timestamp,
  "refundedAt" timestamp
);
CREATE INDEX IF NOT EXISTS payments_companyId_idx ON payments ("companyId");
CREATE INDEX IF NOT EXISTS payments_bookingId_idx ON payments ("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS payments_external_key ON payments (provider, "externalPaymentId");

-- 4. Idempotence des webhooks
CREATE TABLE IF NOT EXISTS payment_events (
  "eventId" text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'stripe',
  type text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
