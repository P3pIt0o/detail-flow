-- Analytics de visites (V1) — migration ADDITIVE uniquement.
-- Aucune table existante n'est modifiée. Isolation par companyId, aucune PII.

CREATE TABLE IF NOT EXISTS tenant_analytics_daily (
  id                serial PRIMARY KEY,
  "companyId"       integer NOT NULL,
  date              text NOT NULL,
  "pageViews"       integer NOT NULL DEFAULT 0,
  "uniqueVisitors"  integer NOT NULL DEFAULT 0,
  "bookingClicks"   integer NOT NULL DEFAULT 0,
  "bookingsCompleted" integer NOT NULL DEFAULT 0,
  meta              jsonb,
  "createdAt"       timestamp NOT NULL DEFAULT now(),
  "updatedAt"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tenant_analytics_daily_company_date_key UNIQUE ("companyId", date)
);

CREATE TABLE IF NOT EXISTS tenant_analytics_visits (
  id           serial PRIMARY KEY,
  "companyId"  integer NOT NULL,
  date         text NOT NULL,
  "visitorId"  text NOT NULL,
  "createdAt"  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tenant_analytics_visits_key UNIQUE ("companyId", date, "visitorId")
);
