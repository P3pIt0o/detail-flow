-- Migration : Rappels SMS + crédits SMS (idempotente, sûre à ré-exécuter).
-- À exécuter UNE FOIS sur la base Neon (via la console SQL Neon ou psql).

/* 1) Préférences de rappel SMS sur la table settings */
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "smsRemindersEnabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "smsReminderOffsetHours" integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "smsReminderTemplate" text;

/* 2) Marqueur d'envoi du rappel SMS (protection anti double-envoi) */
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS "smsReminderSentAt" timestamp;

/* 3) Solde SMS par entreprise (une ligne par tenant) */
CREATE TABLE IF NOT EXISTS sms_credits (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  granted integer NOT NULL DEFAULT 0,
  purchased integer NOT NULL DEFAULT 0,
  "betaBonusGrantedAt" timestamp,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sms_credits_company_unique UNIQUE ("companyId")
);

/* 4) Demandes de recharge SMS (workflow manuel Revolut) */
CREATE TABLE IF NOT EXISTS sms_recharge_requests (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  quantity integer NOT NULL,
  "amountCents" integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "validatedAt" timestamp
);

CREATE INDEX IF NOT EXISTS sms_recharge_requests_companyId_idx ON sms_recharge_requests ("companyId");
CREATE INDEX IF NOT EXISTS sms_recharge_requests_status_idx ON sms_recharge_requests (status);

/* 5) Bonus bêta (20 SMS) attribué UNE SEULE FOIS aux entreprises bêta déjà
      existantes. Sûr à ré-exécuter : n'agit que si la ligne n'existe pas encore. */
INSERT INTO sms_credits ("companyId", balance, granted, "betaBonusGrantedAt")
SELECT c.id, 20, 20, now()
FROM companies c
WHERE c.status = 'BETA'
  AND NOT EXISTS (SELECT 1 FROM sms_credits sc WHERE sc."companyId" = c.id);
