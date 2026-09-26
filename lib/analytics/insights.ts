/**
 * Module Analyse — MOTEUR D'INSIGHTS DÉTERMINISTE (« Ce que vos chiffres
 * suggèrent »). Fonction PURE, aucune dépendance base/serveur, AUCUNE IA/LLM.
 *
 * Objectif : transformer des métriques DÉJÀ calculées en phrases factuelles,
 * gratuites à produire et sans hallucination. Chaque règle a un SEUIL minimum
 * de volume/variation pour ne jamais tirer de conclusion sur un échantillon
 * insuffisant. Ton neutre et non anxiogène (jamais « ERREUR/DANGER/CRITIQUE »).
 */

export type AnalyseInsight = {
  type: "positive" | "attention" | "neutral"
  title: string
  message: string
  /** Métrique source (traçabilité + test). */
  metric: string
}

export type InsightInput = {
  revenue: { currentCents: number; previousCents: number }
  averageBasket: { currentCents: number | null; previousCents: number | null; invoiceCount: number }
  appointments: { scheduled: number; cancelled: number }
  /** Prestation la plus réservée (volume) et la plus contributrice au CA. */
  topServiceByVolume: { name: string; count: number } | null
  topServiceByRevenue: { name: string; revenueCents: number; totalRevenueCents: number } | null
  site: { uniqueVisitors: number; bookingsCompleted: number }
}

/* Seuils minimaux (évitent les conclusions sur trop peu de données). */
const MIN_REVENUE_CHANGE_PCT = 10
const MIN_BASKET_INVOICES = 4
const MIN_BASKET_CHANGE_PCT = 5
const MIN_SCHEDULED_FOR_CANCELLATION = 8
const MIN_SERVICE_VOLUME = 3
const MIN_SERVICE_REVENUE_SHARE_PCT = 25
const MIN_SITE_VISITORS = 30

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function euros(cents: number): string {
  // Format compact et neutre ; l'UI reformatte via les helpers devise si besoin.
  return `${Math.round(cents / 100).toLocaleString("fr-FR")}\u00A0€`
}

/**
 * Construit la liste d'insights. Si AUCUNE règle n'atteint son seuil, retourne
 * un unique message neutre (« Pas encore assez de données ») plutôt qu'un
 * conseil inventé.
 */
export function buildBusinessInsights(input: InsightInput): AnalyseInsight[] {
  const out: AnalyseInsight[] = []

  // 1) Évolution du CA facturé (±10 % minimum).
  const revChange = pctChange(input.revenue.currentCents, input.revenue.previousCents)
  if (revChange !== null && Math.abs(revChange) >= MIN_REVENUE_CHANGE_PCT) {
    const up = revChange > 0
    out.push({
      type: up ? "positive" : "attention",
      title: up ? "Chiffre d'affaires en progression" : "Chiffre d'affaires en baisse",
      message: up
        ? `Votre CA facturé progresse de ${revChange}\u00A0% par rapport à la période précédente.`
        : `Votre CA facturé est en baisse de ${Math.abs(revChange)}\u00A0% par rapport à la période précédente.`,
      metric: "revenue",
    })
  }

  // 2) Panier moyen (min. 4 factures + variation ≥ 5 %).
  const { currentCents, previousCents, invoiceCount } = input.averageBasket
  if (currentCents !== null && previousCents !== null && invoiceCount >= MIN_BASKET_INVOICES) {
    const basketChange = pctChange(currentCents, previousCents)
    if (basketChange !== null && Math.abs(basketChange) >= MIN_BASKET_CHANGE_PCT) {
      const up = basketChange > 0
      out.push({
        type: up ? "positive" : "neutral",
        title: "Panier moyen",
        message: up
          ? `Votre panier moyen progresse de ${basketChange}\u00A0%.`
          : `Votre panier moyen est en baisse de ${Math.abs(basketChange)}\u00A0%.`,
        metric: "average_basket",
      })
    }
  }

  // 3) Taux d'annulation (min. 8 rendez-vous programmés).
  if (input.appointments.scheduled >= MIN_SCHEDULED_FOR_CANCELLATION) {
    const rate = Math.round((input.appointments.cancelled / input.appointments.scheduled) * 100)
    if (rate > 0) {
      out.push({
        type: rate >= 20 ? "attention" : "neutral",
        title: "Rendez-vous annulés",
        message: `${rate}\u00A0% de vos rendez-vous ont été annulés sur cette période.`,
        metric: "cancellation_rate",
      })
    }
  }

  // 4) Prestation qui contribue le plus au CA (part ≥ 25 %).
  const tr = input.topServiceByRevenue
  if (tr && tr.totalRevenueCents > 0) {
    const share = Math.round((tr.revenueCents / tr.totalRevenueCents) * 100)
    if (share >= MIN_SERVICE_REVENUE_SHARE_PCT) {
      out.push({
        type: "neutral",
        title: "Prestation la plus contributrice",
        message: `${tr.name} représente ${share}\u00A0% de votre CA facturé sur cette période (${euros(tr.revenueCents)}).`,
        metric: "top_service_revenue",
      })
    }
  }

  // 5) Prestation la plus réservée (min. 3 rendez-vous).
  const tv = input.topServiceByVolume
  if (tv && tv.count >= MIN_SERVICE_VOLUME) {
    out.push({
      type: "neutral",
      title: "Prestation la plus réservée",
      message: `${tv.name} est votre prestation la plus réservée (${tv.count} rendez-vous).`,
      metric: "top_service_volume",
    })
  }

  // 6) Site & conversion (min. 30 visiteurs).
  if (input.site.uniqueVisitors >= MIN_SITE_VISITORS) {
    const { uniqueVisitors, bookingsCompleted } = input.site
    if (bookingsCompleted > 0) {
      const rate = Math.round((bookingsCompleted / uniqueVisitors) * 1000) / 10
      out.push({
        type: "positive",
        title: "Votre site génère des réservations",
        message: `Votre site a reçu ${uniqueVisitors.toLocaleString("fr-FR")} visiteurs et généré ${bookingsCompleted} réservation${bookingsCompleted > 1 ? "s" : ""} (taux de conversion ${rate.toLocaleString("fr-FR")}\u00A0%).`,
        metric: "site_conversion",
      })
    } else {
      out.push({
        type: "neutral",
        title: "Trafic du site",
        message: `Votre site a reçu ${uniqueVisitors.toLocaleString("fr-FR")} visiteurs sur la période.`,
        metric: "site_traffic",
      })
    }
  }

  if (out.length === 0) {
    out.push({
      type: "neutral",
      title: "Pas encore assez de données",
      message: "Pas encore assez de données pour dégager une tendance sur cette période.",
      metric: "empty",
    })
  }

  return out
}
