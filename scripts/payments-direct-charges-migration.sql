-- Migration ADDITIVE — passage aux Direct Charges + commission 0 %.
-- Ne supprime aucune donnée, ne touche pas aux overrides tenant.

-- 1) Nouvelle colonne miroir de l'état "payouts" du compte connecté.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false;

-- 2) Commission GLOBALE par défaut : 3 % -> 0 %.
--    On ne modifie QUE la valeur globale historique (300). Les overrides tenant
--    vivent dans companies.platformFeeBps et ne sont JAMAIS touchés ici.
UPDATE platform_settings
  SET "defaultPlatformFeeBps" = 0, "updatedAt" = now()
  WHERE id = 1 AND "defaultPlatformFeeBps" = 300;

-- 3) Nouvelle valeur par défaut de colonne pour toute future ligne id=1.
ALTER TABLE platform_settings
  ALTER COLUMN "defaultPlatformFeeBps" SET DEFAULT 0;
