-- ============================================================================
-- LOT D — Rappels RDV pro + Demande d'avis Google
-- Migration ADDITIVE, idempotente, rétrocompatible. NON exécutée automatiquement.
-- À appliquer manuellement sur Neon AVANT publication (voir ordre plus bas).
--
-- Aucune colonne n'est ajoutée au schéma Drizzle (lib/db/schema.ts) : les
-- lectures/écritures passent par lib/notifications/settings-store.ts (SQL brut
-- défensif). Tant que cette migration n'est PAS appliquée :
--   - les pages/admin/réservation restent utilisables (fallback = désactivé) ;
--   - toute tentative d'ACTIVER un réglage renvoie un message explicite
--     (aucun faux succès) ;
--   - aucun rappel / aucune demande d'avis n'est programmé ni envoyé.
--
-- Rien n'est SUPPRIMÉ, renommé, ni rempli de force. Toutes les colonnes sont
-- nullable ou avec DEFAULT sûr (désactivé).
-- ============================================================================

-- 1) Réglages tenant (table `settings`) ------------------------------------
-- Rappel email au professionnel.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pro_reminder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pro_reminder_offset_hours integer NOT NULL DEFAULT 2;

-- Demande d'avis Google après prestation.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS review_request_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS review_request_offset_hours integer NOT NULL DEFAULT 2;
-- Lien de demande d'avis collé manuellement (utilisé si aucun google_place_id
-- fiable n'est déjà configuré). Validé côté serveur avant stockage.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS review_request_link text;

-- 2) Réservations (table `bookings`) ---------------------------------------
-- Horodatage RÉEL de réalisation (distinct du statut et de l'heure prévue).
-- NULL = non terminé. Ne marque jamais la prestation payée.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at timestamp;

-- 3) Outbox de notifications (dédup atomique durable) ----------------------
-- Mécanisme minimal prévu/en cours/envoyé/échoué/ignoré, scopé tenant.
-- Déduplication atomique par (companyId, bookingId, type, recipient) via index
-- unique. `schedule_version` gère l'invalidation lors d'un report (l'ancienne
-- ligne devient obsolète, une nouvelle version est planifiée).
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              serial PRIMARY KEY,
  "companyId"     integer NOT NULL,
  "bookingId"     integer NOT NULL,
  -- "pro_reminder" | "review_request"
  type            text NOT NULL,
  -- destinataire résolu côté serveur (email pro ou client selon le type)
  recipient       text NOT NULL,
  -- "planned" | "sending" | "sent" | "failed" | "skipped" | "cancelled"
  status          text NOT NULL DEFAULT 'planned',
  -- instant d'envoi théorique (UTC)
  send_at         timestamp,
  -- version de programmation : incrémentée à chaque report pour invalider
  -- proprement l'ancienne planification.
  schedule_version integer NOT NULL DEFAULT 1,
  -- id de message fournisseur (idempotence / diagnostic), sans secret
  provider_message_id text,
  -- raison d'un échec / d'un skip (diagnostic, journal réservation), sans secret
  reason          text,
  attempts        integer NOT NULL DEFAULT 0,
  created_at      timestamp NOT NULL DEFAULT NOW(),
  updated_at      timestamp NOT NULL DEFAULT NOW()
);

-- Déduplication atomique durable : une seule tâche vivante par
-- (tenant, réservation, type). Le report réutilise la même clé et met à jour la
-- version + send_at plutôt que de créer un doublon.
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedup_idx
  ON notification_outbox ("companyId", "bookingId", type);

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON notification_outbox (status, send_at);

-- ============================================================================
-- ORDRE D'APPLICATION (avant publication) :
--   1. Appliquer CE fichier sur la base cible (Neon) — idempotent, rejouable.
--   2. Appliquer aussi la migration LOT C en attente :
--      scripts/service-highlight-badge-migration.sql (badges de prestations).
--   Les deux sont indépendantes ; l'ordre entre elles est libre.
-- Après application, les réglages LOT D s'activent d'eux-mêmes dans l'admin.
-- ============================================================================
