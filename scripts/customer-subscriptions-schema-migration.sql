-- ============================================================================
--  Migration ADDITIVE — Abonnements clients (entretien) vendus par les tenants
-- ============================================================================
--  NE PAS EXÉCUTER sans autorisation explicite (règle prod DetailFlow).
--
--  Domaine : Stripe CONNECT (compte du tenant). Aucun lien avec le Billing SaaS
--  DetailFlow (companies.stripeCustomerId / stripeSubscriptionId).
--
--  100 % additive : uniquement CREATE TABLE / INDEX / CONSTRAINT sur 7 NOUVELLES
--  tables. Aucune table existante modifiée, aucune donnée existante touchée.
--
--  Isolation tenant : FK internes COMPOSITES (companyId, ...) — une ligne du
--  tenant A ne peut référencer une ligne du tenant B. Les FK vers clients,
--  services et bookings sont simples : le service serveur DOIT vérifier leur
--  companyId.
--
--  ON DELETE : aucun CASCADE. RESTRICT pour companies et tout le module
--  (historique contractuel/financier conservé), SET NULL uniquement vers
--  clients / services / bookings (le snapshot du contrat fait foi).
--
--  Concurrence (à traiter dans le service, transaction + verrou) : capacité
--  max d'abonnements actifs, réservation du dernier droit d'un cycle,
--  changement de véhicule actif, génération d'un cycle.
--
--  Rollback (aucune donnée historique touchée tant que le module est vide) :
--    DROP TABLE IF EXISTS maintenance_audit_log, maintenance_payments,
--      maintenance_uses, maintenance_cycles, maintenance_subscription_vehicles,
--      maintenance_subscriptions, maintenance_plans;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Formules d'entretien (définies par chaque tenant ; archivées, jamais supprimées)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id                        serial PRIMARY KEY,
  "companyId"               integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                      text    NOT NULL,
  description               text,
  -- Prix PAR PÉRIODE DE FACTURATION (jamais implicitement mensuel).
  "priceCents"              integer NOT NULL,
  currency                  text    NOT NULL DEFAULT 'EUR',
  -- Période de facturation (ex. month/1, week/4). V1 : 1 cycle de droits = 1 période.
  "billingIntervalUnit"     text    NOT NULL DEFAULT 'month',
  "billingIntervalCount"    integer NOT NULL DEFAULT 1,
  "includedUsesPerCycle"    integer NOT NULL DEFAULT 1,
  -- Engagement : none/0 | month/N (mois calendaires) | billing_cycle/N (N échéances).
  -- N mois ≠ N paiements : les échéances sont calculées par le service.
  "commitmentUnit"          text    NOT NULL DEFAULT 'none',
  "commitmentCount"         integer NOT NULL DEFAULT 0,
  "renewalMode"             text    NOT NULL DEFAULT 'open_ended',
  "renewalNoticeDays"       integer,
  "initialServiceId"        integer REFERENCES services(id) ON DELETE SET NULL,
  "initialCleaningRequired" boolean NOT NULL DEFAULT false,
  "allowRecurringPayment"   boolean NOT NULL DEFAULT true,
  "allowPrepaidPayment"     boolean NOT NULL DEFAULT false,
  -- Prépaiement = N périodes de facturation.
  "prepaidBillingCycles"    integer,
  visibility                text    NOT NULL DEFAULT 'public',
  status                    text    NOT NULL DEFAULT 'draft',
  "createdAt"               timestamp NOT NULL DEFAULT now(),
  "updatedAt"               timestamp NOT NULL DEFAULT now(),
  "archivedAt"              timestamp,
  CONSTRAINT maintenance_plans_company_id_key UNIQUE ("companyId", id),
  CONSTRAINT maintenance_plans_price_non_negative CHECK ("priceCents" >= 0),
  CONSTRAINT maintenance_plans_uses_positive CHECK ("includedUsesPerCycle" > 0),
  CONSTRAINT maintenance_plans_billing_interval_valid CHECK (
    "billingIntervalUnit" IN ('week', 'month') AND "billingIntervalCount" > 0
  ),
  CONSTRAINT maintenance_plans_commitment_valid CHECK (
    "commitmentUnit" IN ('none', 'month', 'billing_cycle')
    AND (("commitmentUnit" = 'none' AND "commitmentCount" = 0)
      OR ("commitmentUnit" <> 'none' AND "commitmentCount" > 0))
  ),
  CONSTRAINT maintenance_plans_renewal_mode_valid CHECK (
    "renewalMode" IN ('none', 'same_term', 'open_ended')
    AND ("renewalMode" <> 'same_term' OR "commitmentUnit" <> 'none')
  ),
  CONSTRAINT maintenance_plans_renewal_notice_days_valid CHECK ("renewalNoticeDays" IS NULL OR "renewalNoticeDays" >= 0),
  CONSTRAINT maintenance_plans_prepaid_cycles_valid CHECK (
    ("prepaidBillingCycles" IS NULL OR "prepaidBillingCycles" > 0)
    AND (NOT "allowPrepaidPayment" OR "prepaidBillingCycles" IS NOT NULL)
  ),
  CONSTRAINT maintenance_plans_payment_mode_allowed CHECK ("allowRecurringPayment" OR "allowPrepaidPayment"),
  CONSTRAINT maintenance_plans_visibility_valid CHECK (visibility IN ('public', 'unlisted', 'private')),
  CONSTRAINT maintenance_plans_status_valid CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT maintenance_plans_currency_iso CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX IF NOT EXISTS maintenance_plans_company_status_idx ON maintenance_plans ("companyId", status);

-- ---------------------------------------------------------------------------
-- 2. Contrats client (snapshots contractuels ; jamais supprimés)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_subscriptions (
  id                                serial PRIMARY KEY,
  "companyId"                       integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "planId"                          integer,
  "customerId"                      integer REFERENCES clients(id) ON DELETE SET NULL,
  -- Statut MÉTIER DetailFlow (jamais un statut Stripe brut).
  status                            text    NOT NULL DEFAULT 'pending_payment',
  "paymentMode"                     text    NOT NULL,
  currency                          text    NOT NULL DEFAULT 'EUR',
  "customerName"                    text    NOT NULL,
  "customerEmail"                   text    NOT NULL,
  "customerPhone"                   text,
  -- Conditions contractuelles figées (indépendantes de la formule courante).
  "planNameSnapshot"                text    NOT NULL,
  "priceCentsSnapshot"              integer NOT NULL,
  "billingIntervalUnitSnapshot"     text    NOT NULL,
  "billingIntervalCountSnapshot"    integer NOT NULL,
  "includedUsesPerCycleSnapshot"    integer NOT NULL,
  "commitmentUnitSnapshot"          text    NOT NULL,
  "commitmentCountSnapshot"         integer NOT NULL,
  "renewalModeSnapshot"             text    NOT NULL,
  "renewalNoticeDaysSnapshot"       integer,
  "prepaidBillingCyclesSnapshot"    integer,
  -- Nettoyage initial figé à la souscription (indépendant du prix courant de services).
  "initialCleaningRequiredSnapshot" boolean NOT NULL DEFAULT false,
  "initialServiceNameSnapshot"      text,
  "initialServicePriceCentsSnapshot" integer,
  "termsAcceptedAt"                 timestamp,
  "termsVersion"                    text,
  "createdAt"                       timestamp NOT NULL DEFAULT now(),
  "updatedAt"                       timestamp NOT NULL DEFAULT now(),
  "startedAt"                       timestamp,
  "activatedAt"                     timestamp,
  -- Référence stable des futurs cycles (anchor + billingInterval*Snapshot).
  "billingAnchorAt"                 timestamp,
  -- Terme d'engagement en cours (avance à chaque renouvellement same_term).
  "currentTermStartedAt"            timestamp,
  "currentTermEndsAt"               timestamp,
  "renewalNoticeSentAt"             timestamp,
  -- Non-renouvellement du prochain terme ≠ résiliation (cancel*).
  "renewalOptOutAt"                 timestamp,
  "prepaidUntil"                    timestamp,
  -- Annulation : demande -> date prévue -> effective (révocable tant que cancelledAt IS NULL).
  "cancelRequestedAt"               timestamp,
  "cancelAt"                        timestamp,
  "cancelledAt"                     timestamp,
  "suspendedAt"                     timestamp,
  "endedAt"                         timestamp,
  provider                          text    NOT NULL DEFAULT 'stripe',
  -- Snapshot du compte provider utilisé (ex. acct_…), indépendant de companies.stripeAccountId.
  "providerAccountId"               text,
  "externalCustomerId"              text,
  "externalSubscriptionId"          text,
  "externalCheckoutSessionId"       text,
  -- Hash uniquement : le token de gestion client n'est jamais stocké en clair.
  "manageTokenHash"                 text,
  CONSTRAINT maintenance_subscriptions_company_id_key UNIQUE ("companyId", id),
  -- MATCH SIMPLE : non vérifiée si planId IS NULL. RESTRICT : une formule s'archive.
  CONSTRAINT maintenance_subscriptions_plan_fk FOREIGN KEY ("companyId", "planId")
    REFERENCES maintenance_plans ("companyId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_subscriptions_status_valid CHECK (status IN (
    'pending_initial_cleaning', 'pending_payment', 'active', 'past_due',
    'cancel_scheduled', 'suspended', 'cancelled', 'expired', 'ended'
  )),
  CONSTRAINT maintenance_subscriptions_payment_mode_valid CHECK ("paymentMode" IN ('recurring', 'prepaid')),
  -- V1 : un contrat prépayé expire proprement (renewalModeSnapshot = 'none').
  CONSTRAINT maintenance_subscriptions_prepaid_cycles_valid CHECK (
    ("paymentMode" = 'prepaid') = ("prepaidBillingCyclesSnapshot" IS NOT NULL)
    AND ("prepaidBillingCyclesSnapshot" IS NULL OR "prepaidBillingCyclesSnapshot" > 0)
    AND ("paymentMode" <> 'prepaid' OR "renewalModeSnapshot" = 'none')
  ),
  CONSTRAINT maintenance_subscriptions_billing_interval_valid CHECK (
    "billingIntervalUnitSnapshot" IN ('week', 'month') AND "billingIntervalCountSnapshot" > 0
  ),
  CONSTRAINT maintenance_subscriptions_commitment_valid CHECK (
    "commitmentUnitSnapshot" IN ('none', 'month', 'billing_cycle')
    AND (("commitmentUnitSnapshot" = 'none' AND "commitmentCountSnapshot" = 0)
      OR ("commitmentUnitSnapshot" <> 'none' AND "commitmentCountSnapshot" > 0))
  ),
  CONSTRAINT maintenance_subscriptions_renewal_mode_valid CHECK (
    "renewalModeSnapshot" IN ('none', 'same_term', 'open_ended')
    AND ("renewalModeSnapshot" <> 'same_term' OR "commitmentUnitSnapshot" <> 'none')
  ),
  CONSTRAINT maintenance_subscriptions_renewal_notice_days_valid CHECK (
    "renewalNoticeDaysSnapshot" IS NULL OR "renewalNoticeDaysSnapshot" >= 0
  ),
  CONSTRAINT maintenance_subscriptions_current_term_valid CHECK (
    "currentTermStartedAt" IS NULL OR "currentTermEndsAt" IS NULL OR "currentTermEndsAt" > "currentTermStartedAt"
  ),
  CONSTRAINT maintenance_subscriptions_price_non_negative CHECK ("priceCentsSnapshot" >= 0),
  CONSTRAINT maintenance_subscriptions_uses_positive CHECK ("includedUsesPerCycleSnapshot" > 0),
  CONSTRAINT maintenance_subscriptions_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT maintenance_subscriptions_external_ids_need_account CHECK (
    "providerAccountId" IS NOT NULL
    OR ("externalCustomerId" IS NULL AND "externalSubscriptionId" IS NULL AND "externalCheckoutSessionId" IS NULL)
  ),
  CONSTRAINT maintenance_subscriptions_initial_service_price_non_negative CHECK (
    "initialServicePriceCentsSnapshot" IS NULL OR "initialServicePriceCentsSnapshot" >= 0
  ),
  CONSTRAINT maintenance_subscriptions_terms_version_required CHECK (
    "termsAcceptedAt" IS NULL OR "termsVersion" IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_company_status_idx ON maintenance_subscriptions ("companyId", status);
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_planId_idx ON maintenance_subscriptions ("planId");
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_customerId_idx ON maintenance_subscriptions ("customerId");
-- Scheduler (cross-tenant) : fins de terme, rappels non envoyés, non-renouvellements.
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_status_term_end_idx
  ON maintenance_subscriptions (status, "currentTermEndsAt") WHERE "currentTermEndsAt" IS NOT NULL;
-- IDs externes uniques au sein d'un compte provider uniquement.
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subscriptions_external_subscription_key
  ON maintenance_subscriptions (provider, "providerAccountId", "externalSubscriptionId") WHERE "externalSubscriptionId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subscriptions_checkout_session_key
  ON maintenance_subscriptions (provider, "providerAccountId", "externalCheckoutSessionId") WHERE "externalCheckoutSessionId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_external_customer_idx
  ON maintenance_subscriptions ("providerAccountId", "externalCustomerId") WHERE "externalCustomerId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subscriptions_manage_token_key
  ON maintenance_subscriptions ("manageTokenHash") WHERE "manageTokenHash" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Véhicules (périodes historiques ; un seul véhicule actif par contrat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_subscription_vehicles (
  id                serial PRIMARY KEY,
  "companyId"       integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "subscriptionId"  integer NOT NULL,
  "vehicleBrand"    text    NOT NULL,
  "vehicleModel"    text    NOT NULL,
  "vehiclePlate"    text,
  "vehicleTypeName" text,
  "activeFrom"      timestamp NOT NULL DEFAULT now(),
  "activeUntil"     timestamp,
  "createdAt"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_subscription_vehicles_subscription_fk FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES maintenance_subscriptions ("companyId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_subscription_vehicles_period_valid CHECK ("activeUntil" IS NULL OR "activeUntil" >= "activeFrom")
);
CREATE INDEX IF NOT EXISTS maintenance_subscription_vehicles_company_subscription_idx
  ON maintenance_subscription_vehicles ("companyId", "subscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subscription_vehicles_one_active_key
  ON maintenance_subscription_vehicles ("subscriptionId") WHERE "activeUntil" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Cycles de droits (non reportables) : 1 cycle = 1 période de facturation,
--    générée depuis "billingAnchorAt" + billingInterval*Snapshot du contrat.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_cycles (
  id               serial PRIMARY KEY,
  "companyId"      integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "subscriptionId" integer NOT NULL,
  "cycleStart"     timestamp NOT NULL,
  "cycleEnd"       timestamp NOT NULL,
  "includedUses"   integer NOT NULL,
  status           text    NOT NULL DEFAULT 'open',
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  "updatedAt"      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_cycles_company_subscription_id_key UNIQUE ("companyId", "subscriptionId", id),
  CONSTRAINT maintenance_cycles_subscription_fk FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES maintenance_subscriptions ("companyId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_cycles_subscription_start_key UNIQUE ("subscriptionId", "cycleStart"),
  CONSTRAINT maintenance_cycles_period_valid CHECK ("cycleEnd" > "cycleStart"),
  CONSTRAINT maintenance_cycles_uses_non_negative CHECK ("includedUses" >= 0),
  CONSTRAINT maintenance_cycles_status_valid CHECK (status IN ('open', 'closed', 'void'))
);
CREATE INDEX IF NOT EXISTS maintenance_cycles_company_start_idx ON maintenance_cycles ("companyId", "cycleStart");

-- ---------------------------------------------------------------------------
-- 5. Utilisations de droits (réservation du dernier droit : transaction serveur)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_uses (
  id               serial PRIMARY KEY,
  "companyId"      integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "subscriptionId" integer NOT NULL,
  "cycleId"        integer NOT NULL,
  "bookingId"      integer REFERENCES bookings(id) ON DELETE SET NULL,
  status           text    NOT NULL DEFAULT 'available',
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  "reservedAt"     timestamp,
  "completedAt"    timestamp,
  "releasedAt"     timestamp,
  "expiredAt"      timestamp,
  -- Garantit : droit ∈ cycle ∈ même abonnement ∈ même tenant.
  CONSTRAINT maintenance_uses_cycle_fk FOREIGN KEY ("companyId", "subscriptionId", "cycleId")
    REFERENCES maintenance_cycles ("companyId", "subscriptionId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_uses_status_valid CHECK (status IN ('available', 'reserved', 'completed', 'released', 'expired'))
);
CREATE INDEX IF NOT EXISTS maintenance_uses_company_subscription_idx ON maintenance_uses ("companyId", "subscriptionId");
CREATE INDEX IF NOT EXISTS maintenance_uses_cycle_status_idx ON maintenance_uses ("cycleId", status);
CREATE INDEX IF NOT EXISTS maintenance_uses_bookingId_idx ON maintenance_uses ("bookingId");
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_uses_active_booking_key
  ON maintenance_uses ("bookingId") WHERE "bookingId" IS NOT NULL AND status IN ('reserved', 'completed');

-- ---------------------------------------------------------------------------
-- 6. Paiements d'abonnement (indépendants des bookings ; commission figée)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_payments (
  id                       serial PRIMARY KEY,
  "companyId"              integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "subscriptionId"         integer NOT NULL,
  "cycleId"                integer,
  provider                 text    NOT NULL DEFAULT 'stripe',
  -- Snapshot du compte provider sur lequel le paiement a été créé.
  "providerAccountId"      text,
  "externalPaymentId"      text,
  "externalInvoiceId"      text,
  type                     text    NOT NULL,
  status                   text    NOT NULL DEFAULT 'pending',
  currency                 text    NOT NULL DEFAULT 'EUR',
  "grossAmountCents"       integer NOT NULL,
  -- Snapshot de la commission DetailFlow au paiement (distincte des frais Stripe).
  "platformFeeBps"         integer NOT NULL,
  "platformFeeAmountCents" integer NOT NULL,
  "providerFeeAmountCents" integer,
  "netAmountCents"         integer,
  "refundedAmountCents"    integer NOT NULL DEFAULT 0,
  "createdAt"              timestamp NOT NULL DEFAULT now(),
  "paidAt"                 timestamp,
  "failedAt"               timestamp,
  "refundedAt"             timestamp,
  meta                     jsonb,
  CONSTRAINT maintenance_payments_subscription_fk FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES maintenance_subscriptions ("companyId", id) ON DELETE RESTRICT,
  -- MATCH SIMPLE : non vérifiée si cycleId IS NULL (paiement hors cycle).
  CONSTRAINT maintenance_payments_cycle_fk FOREIGN KEY ("companyId", "subscriptionId", "cycleId")
    REFERENCES maintenance_cycles ("companyId", "subscriptionId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_payments_type_valid CHECK (type IN ('recurring', 'prepaid', 'initial_cleaning', 'adjustment')),
  CONSTRAINT maintenance_payments_status_valid CHECK (status IN (
    'pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'
  )),
  CONSTRAINT maintenance_payments_gross_non_negative CHECK ("grossAmountCents" >= 0),
  CONSTRAINT maintenance_payments_fee_bps_range CHECK ("platformFeeBps" BETWEEN 0 AND 10000),
  CONSTRAINT maintenance_payments_fee_amount_bounds CHECK ("platformFeeAmountCents" BETWEEN 0 AND "grossAmountCents"),
  CONSTRAINT maintenance_payments_provider_fee_non_negative CHECK ("providerFeeAmountCents" IS NULL OR "providerFeeAmountCents" >= 0),
  CONSTRAINT maintenance_payments_refund_bounds CHECK ("refundedAmountCents" BETWEEN 0 AND "grossAmountCents"),
  CONSTRAINT maintenance_payments_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT maintenance_payments_external_ids_need_account CHECK (
    "providerAccountId" IS NOT NULL OR ("externalPaymentId" IS NULL AND "externalInvoiceId" IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS maintenance_payments_company_subscription_idx ON maintenance_payments ("companyId", "subscriptionId");
CREATE INDEX IF NOT EXISTS maintenance_payments_company_status_idx ON maintenance_payments ("companyId", status);
CREATE INDEX IF NOT EXISTS maintenance_payments_external_invoice_idx
  ON maintenance_payments ("externalInvoiceId") WHERE "externalInvoiceId" IS NOT NULL;
-- Idempotence webhook Connect, scopée par compte provider.
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_payments_external_payment_key
  ON maintenance_payments (provider, "providerAccountId", "externalPaymentId") WHERE "externalPaymentId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Journal d'audit (append-only côté applicatif)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_audit_log (
  id               serial PRIMARY KEY,
  "companyId"      integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  "subscriptionId" integer,
  action           text    NOT NULL,
  "actorType"      text    NOT NULL,
  "actorUserId"    text,
  meta             jsonb   NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_audit_log_subscription_fk FOREIGN KEY ("companyId", "subscriptionId")
    REFERENCES maintenance_subscriptions ("companyId", id) ON DELETE RESTRICT,
  CONSTRAINT maintenance_audit_log_action_format CHECK (action ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT maintenance_audit_log_actor_type_valid CHECK ("actorType" IN ('user', 'customer', 'system', 'provider'))
);
CREATE INDEX IF NOT EXISTS maintenance_audit_log_company_created_idx ON maintenance_audit_log ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS maintenance_audit_log_company_subscription_idx ON maintenance_audit_log ("companyId", "subscriptionId");

COMMIT;
