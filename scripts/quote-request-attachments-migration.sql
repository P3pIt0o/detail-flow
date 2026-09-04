-- ============================================================================
-- Pièces jointes (photos) des demandes de devis — ADDITIF
-- ----------------------------------------------------------------------------
-- 1) Nouvelles colonnes NULLABLES sur "custom_requests" :
--      submissionId : clé d'idempotence opaque de la soumission publique
--                     (uuid navigateur). Empêche un double clic / rechargement
--                     de créer deux demandes identiques.
--      notifiedAt   : horodatage de la notification unique au professionnel
--                     (garantit un seul email par demande).
--    + index UNIQUE partiel (companyId, submissionId) : une soumission ne crée
--      qu'une seule demande par entreprise (NULL exclus => demandes historiques
--      intactes).
--
-- 2) Nouvelle table "quote_request_attachments" : une ligne par photo jointe.
--      - companyId + requestId (FK, ON DELETE CASCADE) : suppression en cascade
--        avec l'entreprise ET avec la demande.
--      - pathname : Blob PRIVÉ (jamais d'URL publique). Contrainte UNIQUE =>
--        un même Blob ne peut être associé deux fois.
--      - contentType/sizeBytes : validés côté serveur (signature réelle).
--      - width/height : facultatifs (dimensions après optimisation).
--      - sortOrder : ordre d'affichage.
--    + index sur companyId et sur requestId (lectures scopées).
--
-- SÛRETÉ : purement additif et rétrocompatible.
--   - aucune table existante n'est modifiée dans sa sémantique ;
--   - aucun UPDATE / backfill ;
--   - aucun DROP ;
--   - aucun enum PostgreSQL ;
--   - aucun NOT NULL rétroactif sur les colonnes ajoutées à custom_requests.
--
-- IDEMPOTENT : "IF NOT EXISTS" partout — rejouable sans effet de bord.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit du
-- diff et AVANT tout merge dans main (autorisation explicite requise).
-- ============================================================================

-- 1) Colonnes d'idempotence / notification sur custom_requests --------------
ALTER TABLE "custom_requests"
  ADD COLUMN IF NOT EXISTS "submissionId" text;

ALTER TABLE "custom_requests"
  ADD COLUMN IF NOT EXISTS "notifiedAt" timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "custom_requests_company_submission_key"
  ON "custom_requests" ("companyId", "submissionId")
  WHERE "submissionId" IS NOT NULL;

-- 2) Table des pièces jointes ------------------------------------------------
CREATE TABLE IF NOT EXISTS "quote_request_attachments" (
  "id"           serial PRIMARY KEY,
  "companyId"    integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "requestId"    integer NOT NULL REFERENCES "custom_requests"("id") ON DELETE CASCADE,
  "pathname"     text NOT NULL,
  "originalName" text NOT NULL,
  "contentType"  text NOT NULL,
  "sizeBytes"    integer NOT NULL,
  "width"        integer,
  "height"       integer,
  "sortOrder"    integer NOT NULL DEFAULT 0,
  "createdAt"    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "quote_request_attachments_pathname_key" UNIQUE ("pathname")
);

CREATE INDEX IF NOT EXISTS "quote_request_attachments_companyId_idx"
  ON "quote_request_attachments" ("companyId");

CREATE INDEX IF NOT EXISTS "quote_request_attachments_requestId_idx"
  ON "quote_request_attachments" ("requestId");
