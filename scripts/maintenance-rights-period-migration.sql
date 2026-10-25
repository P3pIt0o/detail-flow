-- L27 — Abonnements clients : période de droits indépendante de l'échéancier (ex. 6 lavages / an payés chaque mois).
-- ADDITIVE, IDEMPOTENTE. Aucune donnée existante modifiée : NULL partout = comportement V1 inchangé
-- (un cycle de droits = une période de facturation). À appliquer à la main, Preview d'abord.

-- 1. Formules : période de droits + échéancier proposé.
ALTER TABLE "maintenance_plans" ADD COLUMN IF NOT EXISTS "rightsPeriodMonths" integer;
ALTER TABLE "maintenance_plans" ADD COLUMN IF NOT EXISTS "paymentSchedule" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_plans_rights_period_valid') THEN
    ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_rights_period_valid"
      CHECK (("rightsPeriodMonths" IS NULL AND "paymentSchedule" IS NULL)
        OR ("rightsPeriodMonths" IN (1, 3, 12) AND "paymentSchedule" IN ('period', 'monthly', 'customer_choice')));
  END IF;
END $$;

-- 2. Contrats : snapshots du paiement mensuel d'une période (priceCentsSnapshot = mensualité).
ALTER TABLE "maintenance_subscriptions" ADD COLUMN IF NOT EXISTS "rightsPeriodMonthsSnapshot" integer;
ALTER TABLE "maintenance_subscriptions" ADD COLUMN IF NOT EXISTS "periodPriceCentsSnapshot" integer;
ALTER TABLE "maintenance_subscriptions" ADD COLUMN IF NOT EXISTS "installmentsPerPeriodSnapshot" integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_subscriptions_rights_period_valid') THEN
    ALTER TABLE "maintenance_subscriptions" ADD CONSTRAINT "maintenance_subscriptions_rights_period_valid"
      CHECK (("rightsPeriodMonthsSnapshot" IS NULL AND "periodPriceCentsSnapshot" IS NULL AND "installmentsPerPeriodSnapshot" IS NULL)
        OR ("rightsPeriodMonthsSnapshot" > 0 AND "periodPriceCentsSnapshot" > 0 AND "installmentsPerPeriodSnapshot" > 0 AND "paymentMode" = 'recurring'));
  END IF;
END $$;

-- 3. Demandes : choix du client pour une formule « au choix » (figé à la création du contrat).
ALTER TABLE IF EXISTS "maintenance_subscription_requests" ADD COLUMN IF NOT EXISTS "paymentScheduleChoice" text;

DO $$
BEGIN
  IF to_regclass('maintenance_subscription_requests') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_subscription_requests_schedule_choice_valid') THEN
    ALTER TABLE "maintenance_subscription_requests" ADD CONSTRAINT "maintenance_subscription_requests_schedule_choice_valid"
      CHECK ("paymentScheduleChoice" IS NULL OR "paymentScheduleChoice" IN ('period', 'monthly'));
  END IF;
END $$;
