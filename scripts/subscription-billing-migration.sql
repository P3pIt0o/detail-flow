-- ============================================================================
--  DetailFlow — LOT S1 : socle de données Stripe Billing (abonnements)
--
--  Migration STRICTEMENT ADDITIVE et IDEMPOTENTE.
--    - aucun DROP, aucun RENAME, aucun UPDATE de données existantes ;
--    - IF NOT EXISTS partout : ré-exécutable sans effet de bord ;
--    - colonnes nullable, sauf billingMode/cancelAtPeriodEnd qui reçoivent un
--      DEFAULT sûr afin que les tenants existants restent valides sans perdre
--      leurs licences (billingMode = 'free', cancelAtPeriodEnd = false).
--
--  Ce socle NE branche AUCUN paiement : ni Product, ni Price, ni Checkout, ni
--  webhook. Il est INDÉPENDANT de Stripe Connect (stripeAccountId,
--  application_fee_amount, paiements réservation, remboursements) : rien de
--  Connect n'est modifié ici.
--
--  À appliquer MANUELLEMENT après revue (non appliquée automatiquement, jamais
--  en production sans validation).
-- ============================================================================

/* -------- 1. Mode de facturation (COMMENT le tenant paie DetailFlow) ------- */
-- Distinct de licensePlan (À QUOI il a droit). Valeur historique sûre 'free'.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "billingMode" text NOT NULL DEFAULT 'free';

/* -------- 2. Identifiants et état Stripe Billing (nullable) ---------------- */
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "subscriptionStatus" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "subscriptionPriceId" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" timestamp;

/* -------- 3. Cycle de vie & ancienneté fidélité (nullable) ---------------- */
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" timestamp;
-- Source de l'ancienneté fidélité : 1re facture RÉELLEMENT payée (pas le trial).
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "continuousSubscriptionStartedAt" timestamp;
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "subscriptionCanceledAt" timestamp;

/* -------- 4. Unicité des identifiants Stripe (uniquement si présents) ------ */
-- Index uniques PARTIELS : n'empêchent jamais plusieurs lignes NULL (tenants
-- sans abonnement), garantissent l'unicité dès qu'un identifiant existe.
CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripeCustomerId_key"
  ON "companies" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripeSubscriptionId_key"
  ON "companies" ("stripeSubscriptionId")
  WHERE "stripeSubscriptionId" IS NOT NULL;

/* -------- 5. Index de lecture ------------------------------------------- */
CREATE INDEX IF NOT EXISTS "companies_subscriptionStatus_idx"
  ON "companies" ("subscriptionStatus");

CREATE INDEX IF NOT EXISTS "companies_billingMode_idx"
  ON "companies" ("billingMode");

/* -------- 6. CHECK constraints (défense au niveau DB) --------------------- */
-- Le TypeScript valide déjà les valeurs, mais la DB doit refuser toute écriture
-- SQL directe ou webhook futur qui poserait une valeur hors énumération.
-- Postgres ne supporte pas `ADD CONSTRAINT IF NOT EXISTS` : on encapsule dans un
-- bloc DO qui vérifie pg_constraint => IDEMPOTENT (ré-exécutable sans erreur).

-- billingMode ∈ { free, subscription, lifetime } (NOT NULL garanti par la colonne).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_billingMode_check'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_billingMode_check"
      CHECK ("billingMode" IN ('free', 'subscription', 'lifetime'));
  END IF;
END $$;

-- subscriptionStatus : NULL autorisé, sinon l'un des statuts Stripe connus.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscriptionStatus_check'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_subscriptionStatus_check"
      CHECK (
        "subscriptionStatus" IS NULL
        OR "subscriptionStatus" IN (
          'trialing', 'active', 'past_due', 'unpaid',
          'canceled', 'incomplete', 'incomplete_expired', 'paused'
        )
      );
  END IF;
END $$;
