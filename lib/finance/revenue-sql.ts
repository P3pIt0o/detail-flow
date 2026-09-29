import "server-only"
import { sql } from "drizzle-orm"
import { bookings, invoices } from "@/lib/db/schema"

/**
 * SOURCE DE VÉRITÉ FINANCIÈRE PARTAGÉE — expressions SQL du « CA facturé ».
 *
 * Ces constructeurs étaient auparavant privés dans `lib/admin/queries.ts`
 * (tableau de bord). Ils sont extraits ici SANS AUCUNE modification de leur
 * logique afin qu'une SEULE définition du chiffre d'affaires soit utilisée par :
 *   - le tableau de bord (`getDashboardStats`, `getRevenueByMonth`) ;
 *   - le module Analyse (`lib/analytics/business.ts`).
 *
 * Règles encapsulées (inchangées) :
 *   - CA net = factures 'paid' (positif) − avoirs 'issued'/'paid' (négatif) ;
 *   - un avoir ne déduit le CA que si sa facture d'origine y comptait ;
 *   - une facture rattachée à une réservation annulée/supprimée est exclue ;
 *   - date d'affectation : prestation → émission → création (avoir : émission).
 *
 * Toutes les sous-requêtes sont scopées `companyId` : l'isolation multi-tenant
 * est préservée à l'identique. Ce module ne LIT ni ne MODIFIE aucune donnée par
 * lui-même : il ne fournit que des fragments SQL composables.
 */

/**
 * CA NET : une facture payée compte en positif, un avoir ÉMIS (ou payé/
 * remboursé) compte en NÉGATIF. Les brouillons d'avoir (status 'draft') n'ont
 * aucun impact. Montants stockés positifs ; le signe est appliqué au calcul.
 */
export const netRevenueSumExpr = sql<string>`sum(case when ${invoices.documentType} = 'credit_note' then -${invoices.totalCents} else ${invoices.totalCents} end)`

/**
 * Date retenue pour l'affectation à une période :
 *  - facture : date de prestation, sinon émission, sinon création ;
 *  - AVOIR   : sa propre date d'ÉMISSION (issueDate), sinon création.
 */
export const revenuePeriodDateExpr = sql`(
  case when ${invoices.documentType} = 'credit_note'
    then coalesce(${invoices.issueDate}, ${invoices.createdAt}::date)
    else coalesce(${invoices.serviceDate}, ${invoices.issueDate}, ${invoices.createdAt}::date)
  end
)`

/**
 * Sous-requête : un avoir n'est déductible du CA net que si sa facture d'ORIGINE
 * entrait elle-même dans le CA payé (facture 'paid', même tenant, réservation
 * liée non annulée). Scopée companyId.
 */
export function creditNoteOriginalCountedInRevenue(companyId: number) {
  return sql`exists (
    select 1 from ${invoices} orig
    where orig.id = ${invoices.originalInvoiceId}
      and orig."companyId" = ${companyId}
      and orig."documentType" = 'invoice'
      and orig.status = 'paid'
      and (
        orig."bookingId" is null
        or exists (
          select 1 from ${bookings} b
          where b.id = orig."bookingId"
            and b."companyId" = ${companyId}
            and b.status <> 'cancelled'
        )
      )
  )`
}

/**
 * Documents entrant dans le CA net :
 *  - factures 'paid' (positif) ;
 *  - avoirs 'issued'/'paid' (négatif) UNIQUEMENT si leur facture d'origine
 *    comptait dans le CA payé.
 */
export function revenueDocumentFilter(companyId: number) {
  return sql`(
    (${invoices.documentType} = 'invoice' and ${invoices.status} = 'paid')
    or (
      ${invoices.documentType} = 'credit_note'
      and ${invoices.status} in ('issued', 'paid')
      and ${creditNoteOriginalCountedInRevenue(companyId)}
    )
  )`
}

/**
 * Exclut une facture PAYÉE rattachée à une réservation ANNULÉE ou SUPPRIMÉE.
 * Les factures sans réservation liée (bookingId NULL) comptent normalement.
 * Sous-requête scopée companyId. Ne modifie AUCUNE facture (lecture seule).
 */
export function excludeCancelledOrDeletedBooking(companyId: number) {
  return sql`(
    ${invoices.bookingId} is null
    or exists (
      select 1 from ${bookings} b
      where b.id = ${invoices.bookingId}
        and b."companyId" = ${companyId}
        and b.status <> 'cancelled'
    )
  )`
}
