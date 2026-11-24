-- L75 — Heures de début fixes par jour (business_hours)
-- Additif et idempotent. NE PAS exécuter automatiquement : à appliquer à la main
-- (Preview d'abord ; sauvegarde Neon créée juste avant en production),
-- AVANT le déploiement du code.
-- NULL = comportement historique (pas global slotIntervalMin).

ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS "fixedStartTimes" TEXT;
