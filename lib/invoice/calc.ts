/**
 * ============================================================================
 *  CALCUL DES MONTANTS D'UNE FACTURE — logique PURE (aucun accès BDD)
 * ============================================================================
 *  Tous les montants sont en CENTIMES (integer) pour éviter les erreurs
 *  d'arrondi. Cette fonction est la source de vérité du recalcul, utilisée
 *  côté serveur (persistance) ET côté client (aperçu live de l'éditeur).
 * ============================================================================
 */

export type InvoiceLineKind = "service" | "option" | "travel" | "fee"

export interface InvoiceCalcLine {
  kind: InvoiceLineKind
  quantity: number
  unitPriceCents: number
}

export interface InvoiceCalcInput {
  lines: InvoiceCalcLine[]
  /** Remise exceptionnelle globale (centimes, >= 0). */
  discountCents: number
  vatEnabled: boolean
  /** Taux de TVA en pourcentage (ex. 20 pour 20 %). */
  vatRate: number
  /** Acompte déjà réglé (repris de la réservation). */
  depositCents: number
  /** Somme des paiements enregistrés après émission. */
  paidCents: number
}

export interface InvoiceCalcResult {
  itemsTotalCents: number
  discountCents: number
  netCents: number
  vatCents: number
  totalCents: number
  depositCents: number
  paidCents: number
  balanceCents: number
}

function toInt(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0)
}

/**
 * Recalcule tous les totaux d'une facture à partir de ses lignes.
 *  itemsTotal = Σ (quantité × prix unitaire)
 *  net (HT)   = itemsTotal − remise         (jamais négatif)
 *  TVA        = net × taux                    (si activée)
 *  total TTC  = net + TVA
 *  reste dû   = total − acompte − paiements   (jamais négatif)
 */
export function computeInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  const itemsTotalCents = input.lines.reduce(
    (sum, l) => sum + toInt(l.quantity) * toInt(l.unitPriceCents),
    0,
  )

  const discountCents = Math.max(0, toInt(input.discountCents))
  const netCents = Math.max(0, itemsTotalCents - discountCents)

  const rate = Number.isFinite(input.vatRate) ? input.vatRate : 0
  const vatCents = input.vatEnabled ? toInt((netCents * rate) / 100) : 0

  const totalCents = netCents + vatCents

  const depositCents = Math.max(0, toInt(input.depositCents))
  const paidCents = Math.max(0, toInt(input.paidCents))
  const balanceCents = Math.max(0, totalCents - depositCents - paidCents)

  return {
    itemsTotalCents,
    discountCents,
    netCents,
    vatCents,
    totalCents,
    depositCents,
    paidCents,
    balanceCents,
  }
}

/** Libellés FR des types de ligne. */
export const LINE_KIND_LABEL: Record<InvoiceLineKind, string> = {
  service: "Prestation",
  option: "Option",
  travel: "Déplacement",
  fee: "Frais",
}

/** Libellés FR des statuts de facture. */
export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled"

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; className: string; dot: string }
> = {
  draft: {
    label: "Brouillon",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
  issued: {
    label: "Émise",
    className: "bg-primary/10 text-primary border-primary/20",
    dot: "bg-primary",
  },
  paid: {
    label: "Payée",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Annulée",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
  },
}

export function invoiceStatusMeta(status: string) {
  return INVOICE_STATUS_META[status as InvoiceStatus] ?? INVOICE_STATUS_META.draft
}

/** Libellés FR des méthodes de paiement. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
}
