-- ============================================================================
--  Migration ADDITIVE — Remboursements Stripe Connect (Direct Charges)
-- ============================================================================
--  NE PAS EXÉCUTER sans autorisation explicite (règle prod DetailFlow).
--
--  Objectif : persister DURABLEMENT chaque remboursement comme une OPÉRATION
--  DISTINCTE, sans jamais modifier ni supprimer le paiement initial.
--
--  100 % additive :
--    - aucune suppression, aucun DROP, aucun rename ;
--    - aucune colonne existante modifiée de façon destructive ;
--    - la table `payments` conserve `refundedAmountCents` / `refundedAt` /
--      `status` (agrégats), alimentés à partir des lignes `refunds` ;
--    - `payment_events` (journal d'idempotence webhook) est RÉUTILISÉ tel quel
--      pour refund.created / refund.updated / refund.failed / charge.refunded.
--
--  Rollback : DROP TABLE IF EXISTS refunds;  (aucune donnée historique touchée)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refunds (
  id                 serial PRIMARY KEY,
  -- Scoping multi-tenant : renseigné côté serveur, jamais depuis le navigateur.
  "companyId"        integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Paiement d'origine (jamais modifié/supprimé par le remboursement).
  "paymentId"        integer NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  "bookingId"        integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider           text    NOT NULL DEFAULT 'stripe',
  -- Identifiant Stripe du remboursement (re_...), connu après l'appel/webhook.
  "externalRefundId" text,
  -- Montant remboursé en CENTIMES entiers (brut, hors frais Stripe).
  "amountCents"      integer NOT NULL,
  currency           text    NOT NULL DEFAULT 'EUR',
  -- Motif obligatoire saisi par l'opérateur (jamais de donnée bancaire).
  reason             text,
  -- Statut GÉNÉRIQUE : requested | pending | succeeded | failed | canceled.
  status             text    NOT NULL DEFAULT 'pending',
  -- Traçabilité (id user super-admin / admin), sans donnée personnelle client.
  "initiatedByUserId" text,
  -- Clé d'idempotence Stripe STABLE (anti double clic / double création).
  "idempotencyKey"   text,
  meta               jsonb,
  "createdAt"        timestamp NOT NULL DEFAULT now(),
  "updatedAt"        timestamp NOT NULL DEFAULT now(),
  "succeededAt"      timestamp,
  "failedAt"         timestamp,
  "canceledAt"       timestamp
);

-- Isolation / recherche.
CREATE INDEX IF NOT EXISTS refunds_companyId_idx ON refunds("companyId");
CREATE INDEX IF NOT EXISTS refunds_paymentId_idx ON refunds("paymentId");
CREATE INDEX IF NOT EXISTS refunds_bookingId_idx ON refunds("bookingId");

-- Idempotence webhook : un même remboursement Stripe ne peut exister qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_external_key
  ON refunds(provider, "externalRefundId")
  WHERE "externalRefundId" IS NOT NULL;

-- Idempotence création : un double clic réutilise la même clé => une seule ligne.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_idempotency_key
  ON refunds("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
