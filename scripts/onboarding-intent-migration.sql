-- ============================================================================
-- Parcours d'onboarding — intention choisie avant l'inscription (additif)
-- ----------------------------------------------------------------------------
-- RÉGULARISATION D'HISTORIQUE : la colonne et la contrainte ci-dessous ont
-- DÉJÀ été appliquées manuellement sur la base Neon de production. Ce fichier
-- ne fait qu'aligner l'historique du dépôt afin qu'une NOUVELLE base DetailFlow
-- reproduise exactement le même schéma. Il est sûr de le rejouer sur une base
-- où la colonne/contrainte existent déjà (voir IDEMPOTENT plus bas).
--
-- Ajoute une colonne TEXT NULLABLE sur "companies" :
--   onboardingIntent : parcours self-service choisi avant l'inscription.
--
-- Valeurs autorisées (contrainte CHECK) :
--   - 'booking_only'   => le pro a déjà un site, DetailFlow = moteur de résa.
--   - 'public_page'    => le pro veut une page publique DetailFlow (/p/<slug>).
--   - 'custom_website' => demande de site personnalisé (qualification).
--
-- Sémantique applicative :
--   - NULL => tenant historique / inscription directe => dashboard standard
--             inchangé (source de vérité : lib/onboarding/intent.ts).
--
-- SÛRETÉ : purement additif. Aucune donnée existante n'est modifiée :
--   - aucun UPDATE / backfill
--   - aucun DEFAULT
--   - aucun NOT NULL
--   - aucun DROP
--   - aucun enum PostgreSQL
--   - aucune autre colonne / table touchée
-- Toutes les entreprises existantes conservent NULL => comportement inchangé
-- (Spirit ACS, Rozan, Cleanyzer, JustClean et tout tenant customSiteKey inclus).
--
-- IDEMPOTENT :
--   - "ADD COLUMN IF NOT EXISTS" ne recrée jamais la colonne existante.
--   - La contrainte CHECK n'est ajoutée que si elle n'existe pas déjà
--     (garde via pg_constraint). Rejouable sans effet de bord ni erreur.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit
-- du diff. (Déjà appliquée en production — voir en-tête.)
-- ============================================================================

-- 1) Colonne d'intention d'onboarding (nullable, sans défaut).
ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "onboardingIntent" text;

-- 2) Contrainte de domaine de valeurs, posée de façon idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_onboarding_intent_check'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_onboarding_intent_check"
      CHECK ("onboardingIntent" IN ('booking_only', 'public_page', 'custom_website'));
  END IF;
END $$;
