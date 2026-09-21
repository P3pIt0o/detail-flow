-- ============================================================================
-- DetailFlow V2 — LOT 2 — Configurateur de page publique /p/<slug> (ADDITIF)
-- ----------------------------------------------------------------------------
-- Crée UNE nouvelle table "public_page_config" (1 ligne par entreprise) qui
-- stocke la configuration de la page publique paramétrable. La configuration
-- est NORMALISÉE (une colonne requêtable par réglage), pas un JSON opaque.
--
-- Modèle de résolution applicatif (fallback, aucune duplication de données) :
--   config dédiée (cette table)  →  colonnes existantes de "companies"
--   (logoUrl, brandPrimary, hero*, siteContent, socialLinks…)  →  défauts neutres.
-- Les entreprises existantes SANS ligne ici gardent EXACTEMENT le rendu actuel.
--
-- SITES CUSTOM : Spirit ACS / Rozan / Cleanyzer / JustClean et tout tenant
-- avec companies."customSiteKey" IS NOT NULL ne sont JAMAIS concernés par ce
-- configurateur (le dispatch public conserve leur rendu dédié historique).
-- Aucune ligne n'est créée pour eux ; aucun backfill.
--
-- SÛRETÉ : purement additif.
--   - aucun DROP TABLE / DROP COLUMN
--   - aucun UPDATE / backfill / DELETE / TRUNCATE
--   - aucune modification de table ou de donnée existante
--   - aucun enum PostgreSQL (valeurs contrôlées côté application)
--   - la clé étrangère référence companies(id) en ON DELETE CASCADE : si une
--     entreprise est supprimée par un flux EXISTANT, sa config suit ; ce script
--     ne supprime jamais rien de lui-même.
--
-- IDEMPOTENT : "CREATE TABLE IF NOT EXISTS" + "CREATE INDEX IF NOT EXISTS"
-- peuvent être rejoués sans effet de bord.
--
-- NE PAS exécuter automatiquement. À appliquer manuellement sur
-- neon-amber-yacht / main (SQL Editor) après audit du diff.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public_page_config" (
  "id"                serial PRIMARY KEY,
  -- Une seule configuration par entreprise (contrainte UNIQUE).
  "companyId"         integer NOT NULL UNIQUE
                        REFERENCES "companies"("id") ON DELETE CASCADE,
  -- Variante de mise en page ("classic" | "bold" | "minimal"…). NULL = défaut app.
  "layoutVariant"     text,
  -- Hero : image de fond (pathname Blob privé ou URL), cadrage, opacité du voile.
  "heroImageUrl"      text,
  "heroImagePosition" text,
  "heroOverlay"       integer,
  -- Accents de marque propres à la page publique (repli sur companies.brand*).
  "accentPrimary"     text,
  "accentSecondary"   text,
  -- Thème d'affichage : "light" | "dark" | "auto".
  "theme"             text NOT NULL DEFAULT 'auto',
  -- Sections optionnelles (activées par défaut, se masquent seules si vides).
  "showGallery"       boolean NOT NULL DEFAULT true,
  "showReviews"       boolean NOT NULL DEFAULT true,
  "showAbout"         boolean NOT NULL DEFAULT true,
  -- Informations commerciales éditables.
  "interventionZone"  text,
  "depositRuleText"   text,
  "cancellationPolicy" text,
  -- SEO : indexation DÉSACTIVÉE par défaut (le Lot 6 n'indexera que les pages
  -- explicitement publiées et suffisamment riches).
  "seoIndexable"      boolean NOT NULL DEFAULT false,
  -- Publication : NULL tant que la page n'a pas été publiée par le propriétaire.
  "publishedAt"       timestamp,
  "createdAt"         timestamp NOT NULL DEFAULT now(),
  "updatedAt"         timestamp NOT NULL DEFAULT now()
);

-- Index d'accès par entreprise (la contrainte UNIQUE crée déjà un index unique
-- sur "companyId" ; celui-ci reste sans risque et idempotent).
CREATE INDEX IF NOT EXISTS "public_page_config_companyId_idx"
  ON "public_page_config" ("companyId");
