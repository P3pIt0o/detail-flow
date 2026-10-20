-- ============================================================================
-- L19 — Promotions et stockage (additif)
-- ----------------------------------------------------------------------------
-- Crée, par entreprise ("companyId") :
--   promotions          : offres de réduction (multi-prestations, prestation +
--                         option, multi-options). Paliers et périmètre en jsonb,
--                         validés par le moteur (lib/booking/promotions) à
--                         l'écriture ET à la lecture. Pourcentages en points de
--                         base, montants en centimes. Créées DÉSACTIVÉES.
--   cart_rules          : équivalences « même traitement » (ex. prestation 158 ↔
--                         option 98), motif obligatoire. Aucune règle par défaut.
--   upsell_suggestions  : compléments suggérés par le pro pour une prestation.
-- Ajoute sur "bookings" (détail figé des promotions, utilisé par un lot suivant) :
--   promotionDiscountCents, promotionSnapshot (NULL = aucune promotion).
--
-- SÛRETÉ : purement additif — aucun DROP, RENAME, UPDATE ni changement de type ;
-- colonnes "bookings" nullables sans DEFAULT. Tables non déclarées dans le
-- schéma Drizzle : avant application, le code les lit de façon défensive
-- (lib/booking/promotions-store.ts) et rien ne change.
--
-- IDEMPOTENT : rejouable sans effet de bord.
-- NE PAS exécuter automatiquement. Application manuelle : branche Neon `dev`
-- d'abord, puis production après validation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "promotions" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL CHECK (length(trim("name")) > 0),
  "kind" text NOT NULL CHECK ("kind" IN ('multi_services', 'service_option', 'multi_options')),
  "active" boolean NOT NULL DEFAULT false,
  "startsAt" timestamptz,
  "endsAt" timestamptz,
  "priority" integer NOT NULL DEFAULT 0,
  "stackable" boolean NOT NULL DEFAULT false,
  "stackableWithPromoCode" boolean NOT NULL DEFAULT false,
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tiers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotions_dates_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt"),
  CONSTRAINT "promotions_tiers_array_check" CHECK (jsonb_typeof("tiers") = 'array'),
  CONSTRAINT "promotions_scope_object_check" CHECK (jsonb_typeof("scope") = 'object')
);
CREATE INDEX IF NOT EXISTS "promotions_companyId_idx" ON "promotions" ("companyId");

CREATE TABLE IF NOT EXISTS "cart_rules" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'equivalence' CHECK ("kind" IN ('equivalence')),
  "itemA" jsonb NOT NULL,
  "itemB" jsonb NOT NULL,
  "reason" text NOT NULL CHECK (length(trim("reason")) > 0),
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cart_rules_items_check" CHECK (jsonb_typeof("itemA") = 'object' AND jsonb_typeof("itemB") = 'object')
);
CREATE INDEX IF NOT EXISTS "cart_rules_companyId_idx" ON "cart_rules" ("companyId");

CREATE TABLE IF NOT EXISTS "upsell_suggestions" (
  "id" serial PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "whenServiceId" integer NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "suggest" jsonb NOT NULL CHECK (jsonb_typeof("suggest") = 'array'),
  "message" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "upsell_suggestions_companyId_idx" ON "upsell_suggestions" ("companyId");

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "promotionDiscountCents" integer;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "promotionSnapshot" jsonb;
