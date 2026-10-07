-- LOT Essentiel V2 + SMS : grant mensuel PRO + packs SMS via Stripe Checkout.
-- Idempotent, additif uniquement : aucune donnée historique modifiée.
-- NE PAS exécuter automatiquement.

ALTER TABLE sms_credits ADD COLUMN IF NOT EXISTS "monthlyGrantKey" text;
ALTER TABLE sms_credits ADD COLUMN IF NOT EXISTS "monthlyGrantedTotal" integer NOT NULL DEFAULT 0;

ALTER TABLE sms_recharge_requests ADD COLUMN IF NOT EXISTS "paymentProvider" text NOT NULL DEFAULT 'manual';
ALTER TABLE sms_recharge_requests ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" text;
ALTER TABLE sms_recharge_requests ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" text;

CREATE UNIQUE INDEX IF NOT EXISTS sms_recharge_requests_stripe_session_key
  ON sms_recharge_requests ("stripeCheckoutSessionId");
