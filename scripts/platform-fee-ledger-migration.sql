-- ============================================================================
--  Migration ADDITIVE — Plafond mensuel des commissions Stripe Connect
-- ============================================================================
--  NE PAS EXÉCUTER sans autorisation explicite (règle prod DetailFlow).
--  À appliquer AVANT de déployer le code qui l'utilise : sans ces tables,
--  createBookingCheckout refuse de créer un paiement (fail closed).
--
--  100 % additive : aucune table/colonne existante modifiée ou supprimée.
--
--  platform_fee_monthly_counters : total réservé+consommé par (tenant, mois
--    civil YYYY-MM dans companies.timezone). La ligne est verrouillée
--    (SELECT ... FOR UPDATE) pendant chaque réservation → deux paiements
--    concurrents ne peuvent jamais dépasser le plafond.
--
--  platform_fee_reservations : trace DURABLE de chaque réservation (montant,
--    mois ORIGINAL, statut). Table séparée de `payments` car les lignes
--    `payments` "pending" sont supprimées à chaque nouvelle tentative, alors
--    que la session Stripe correspondante reste payable jusqu'à expiration.
--    La libération passe par `status = 'reserved'` → idempotente.
--
--  Rollback : DROP TABLE IF EXISTS platform_fee_reservations;
--             DROP TABLE IF EXISTS platform_fee_monthly_counters;
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_fee_monthly_counters (
  "companyId"     integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "monthKey"      text    NOT NULL,
  "consumedCents" integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp NOT NULL DEFAULT now(),
  "updatedAt"     timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY ("companyId", "monthKey"),
  CONSTRAINT platform_fee_counters_month_key_format CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT platform_fee_counters_consumed_non_negative CHECK ("consumedCents" >= 0)
);

CREATE TABLE IF NOT EXISTS platform_fee_reservations (
  id                    serial PRIMARY KEY,
  "companyId"           integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "bookingId"           integer REFERENCES bookings(id) ON DELETE SET NULL,
  -- Mois civil ORIGINAL : toute libération ultérieure s'y rattache.
  "monthKey"            text    NOT NULL,
  -- Tentative logique (anti double clic) ; unique tant que la réservation vit.
  "attemptKey"          text    NOT NULL,
  -- Session Stripe Checkout (cs_...), connue après création.
  "externalPaymentId"   text,
  "grossAmountCents"    integer NOT NULL,
  "feeBps"              integer NOT NULL,
  "monthlyCapCents"     integer,
  "feeSource"           text    NOT NULL,
  "reservedCents"       integer NOT NULL,
  -- Part de commission réellement restituée (remboursements), cumulée.
  "refundReleasedCents" integer NOT NULL DEFAULT 0,
  -- reserved | consumed | released
  status                text    NOT NULL DEFAULT 'reserved',
  "releaseReason"       text,
  "createdAt"           timestamp NOT NULL DEFAULT now(),
  "updatedAt"           timestamp NOT NULL DEFAULT now(),
  "consumedAt"          timestamp,
  "releasedAt"          timestamp,
  CONSTRAINT platform_fee_res_month_key_format CHECK ("monthKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT platform_fee_res_gross_non_negative CHECK ("grossAmountCents" >= 0),
  CONSTRAINT platform_fee_res_bps_range CHECK ("feeBps" BETWEEN 0 AND 10000),
  CONSTRAINT platform_fee_res_cap_non_negative CHECK ("monthlyCapCents" IS NULL OR "monthlyCapCents" >= 0),
  CONSTRAINT platform_fee_res_reserved_non_negative CHECK ("reservedCents" >= 0),
  CONSTRAINT platform_fee_res_refund_bounds CHECK ("refundReleasedCents" BETWEEN 0 AND "reservedCents"),
  CONSTRAINT platform_fee_res_status_valid CHECK (status IN ('reserved', 'consumed', 'released')),
  CONSTRAINT platform_fee_res_source_valid CHECK ("feeSource" IN ('lifetime', 'override', 'plan', 'fallback'))
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_fee_res_active_attempt_key
  ON platform_fee_reservations ("attemptKey")
  WHERE status IN ('reserved', 'consumed');

CREATE UNIQUE INDEX IF NOT EXISTS platform_fee_res_external_key
  ON platform_fee_reservations ("externalPaymentId")
  WHERE "externalPaymentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_fee_res_company_month_idx
  ON platform_fee_reservations ("companyId", "monthKey");
