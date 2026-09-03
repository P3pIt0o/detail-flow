-- ============================================================================
-- Galerie de réalisations en PHOTOS SIMPLES — nouvelle table (additif)
-- ----------------------------------------------------------------------------
-- Crée la table "photoGallery" : des photos simples de véhicules nettoyés,
-- distinctes du comparateur Avant/Après ("beforeAfterGallery", INCHANGÉE).
--
-- Chaque ligne appartient à UNE entreprise ("companyId"), avec suppression en
-- cascade cohérente avec les autres tables de contenu (galerie, avis…).
--
-- Colonnes :
--   id          : identifiant (serial, clé primaire).
--   companyId   : entreprise propriétaire (FK companies, ON DELETE CASCADE).
--   imageUrl    : pathname du Blob privé (servi via /api/photo-gallery-image).
--   title       : titre facultatif.
--   description : description facultative.
--   altText     : texte alternatif (accessibilité).
--   sortOrder   : ordre d'affichage (réorganisable).
--   published   : visible sur le site public (true) ou masqué (false).
--   createdAt   : date de création.
--   updatedAt   : date de modification.
--
-- Index :
--   photoGallery_companyId_idx                    : lectures scopées entreprise.
--   photoGallery_companyId_published_sort_idx     : affichage public (publiées,
--                                                   dans l'ordre).
--
-- SÛRETÉ : purement additif et rétrocompatible.
--   - aucune table existante n'est modifiée (ni beforeAfterGallery ni autre) ;
--   - aucun UPDATE / backfill ;
--   - aucun DROP ;
--   - aucun enum PostgreSQL.
-- Les entreprises existantes ne possèdent simplement aucune ligne : la section
-- publique reste masquée tant qu'aucune photo n'est publiée.
--
-- IDEMPOTENT : "IF NOT EXISTS" permet de rejouer sans effet de bord.
--
-- NE PAS exécuter automatiquement. Application manuelle sur Neon après audit du
-- diff et AVANT tout merge dans main (autorisation explicite requise).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "photoGallery" (
  "id"          serial PRIMARY KEY,
  "companyId"   integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "imageUrl"    text NOT NULL,
  "title"       text,
  "description" text,
  "altText"     text,
  "sortOrder"   integer NOT NULL DEFAULT 0,
  "published"   boolean NOT NULL DEFAULT true,
  "createdAt"   timestamp NOT NULL DEFAULT now(),
  "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "photoGallery_companyId_idx"
  ON "photoGallery" ("companyId");

CREATE INDEX IF NOT EXISTS "photoGallery_companyId_published_sort_idx"
  ON "photoGallery" ("companyId", "published", "sortOrder");
