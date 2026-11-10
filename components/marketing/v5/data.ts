/**
 * Accueil v5 (L42) — données et styles partagés.
 *
 * RÈGLE : aucun montant, taux ou quota écrit ici. Tout vient des sources de
 * vérité (offres, commissions, droits par plan, SMS). Les textes viennent de la
 * maquette validée `docs/lots/L42.apercu.html`.
 */
import { COMMERCIAL_PLANS, INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT, formatBpsPercent, type CommercialPlan } from "@/lib/pricing/plans"
import { COMMISSION_RULES } from "@/lib/billing/commercial-rules"
import { formatPrice } from "@/lib/format"
import { PLAN_MATRIX } from "@/lib/licensing/registry"
import { SMS_MONTHLY_INCLUDED_BY_PLAN } from "@/lib/sms/config"

export { INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT }

export function getPlan(id: CommercialPlan["id"]): CommercialPlan {
  const plan = COMMERCIAL_PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`Offre introuvable : ${id}`)
  return plan
}

/** Valeurs commerciales affichées, toutes dérivées des sources de vérité. */
export const OFFER = {
  freeFeePercent: formatBpsPercent(COMMISSION_RULES.FREE.feeBps),
  freeFeeCap: formatPrice(COMMISSION_RULES.FREE.monthlyFeeCapCents),
  proFeePercent: formatBpsPercent(COMMISSION_RULES.PRO.feeBps),
  businessFeePercent: formatBpsPercent(COMMISSION_RULES.BUSINESS.feeBps),
  freeQuotes: PLAN_MATRIX.FREE.limits.maxQuotesPerMonth,
  freeInvoices: PLAN_MATRIX.FREE.limits.maxInvoicesPerMonth,
  proSms: SMS_MONTHLY_INCLUDED_BY_PLAN.PRO,
}

/** Logos clients (accord confirmé), ordre de la maquette. */
export const CLIENT_LOGOS = [
  { name: "Rhine Shine Detailling", src: "/marketing/v5/logos/rhine-shine.webp", alt: "Rhine Shine Detailling" },
  { name: "KY Detailing", src: "/marketing/v5/logos/ky-detailing.webp", alt: "KY Detailing" },
  { name: "AutoCare", src: "/marketing/v5/logos/autocare.webp", alt: "AutoCare" },
  { name: "JustClean", src: "/marketing/v5/logos/justclean.webp", alt: "JustClean" },
] as const

/** Avis Trustpilot, MOT POUR MOT. Le premier est mis en avant. */
export const REVIEWS = [
  {
    quote:
      "« Tout est fluide et intuitif, la prise en main est rapide […] Le design est également très réussi : moderne, propre et professionnel, ce qui donne une vraie bonne image auprès des clients. »",
    author: "JustClean",
    context: ", detailing en Vendée · avis Trustpilot, août 2026",
  },
  {
    quote:
      "« Le site est complet, très facile à utiliser et surtout bien pensé, aussi bien pour le professionnel que pour l’utilisateur. Tout est clair, intuitif et pratique, ce qui permet de gagner du temps et de vraiment simplifier la gestion. »",
    author: "AutoCare",
    context: ", detailing à Hyères · avis Trustpilot, août 2026",
  },
  {
    quote:
      "« Un outil vraiment pratique au quotidien. […] Tout est bien pensé, ce qui me fait gagner beaucoup de temps au quotidien pour mon entreprise de nettoyage automobile. »",
    author: "Dh_auto_clean",
    context: ", nettoyage automobile, Belgique · avis Trustpilot, août 2026",
  },
] as const

/** FAQ de l'accueil (rendue + JSON-LD FAQPage). */
export const FAQ_V5: readonly { q: string; a: string }[] = [
  {
    q: "Faut-il une carte bancaire pour commencer ?",
    a: "Non. L'offre Essentiel est gratuite, sans carte et sans engagement.",
  },
  {
    q: "Mes clients peuvent-ils payer un acompte en ligne ?",
    a: "Oui, par carte bancaire au moment de la réservation. L'argent est versé sur votre compte.",
  },
  {
    q: "Ça marche si je me déplace chez mes clients ?",
    a: "Oui : en atelier, à domicile, ou les deux.",
  },
  {
    q: "Combien prend DetailFlow sur mes paiements ?",
    a: `Rien sur les offres payantes. Sur l'offre gratuite Essentiel : ${OFFER.freeFeePercent} des paiements en ligne, plafonnés à ${OFFER.freeFeeCap} par mois. Les frais de Stripe s'appliquent à part.`,
  },
]

/** Classes partagées (couleurs et espacements de la maquette). */
export const UI = {
  wrap: "mx-auto box-border max-w-[1180px] px-6",
  btn: "inline-flex min-h-12 items-center justify-center rounded-lg px-[22px] text-base font-semibold no-underline",
  primary: "bg-[#1d5fd0] text-white hover:bg-[#174ead] hover:text-white",
  secondary: "border border-[#c9c5bb] text-[#16181d] hover:border-[#16181d] hover:text-[#16181d]",
  h2: "m-0 max-w-[20ch] text-[clamp(28px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]",
  muted: "text-[#6b675e]",
  link: "text-[#1d5fd0] hover:text-[#174ead]",
  shot: "block h-auto w-full rounded-[10px] border border-[#2a2e36] bg-[#0d1117] shadow-[inset_0_1px_0_#fff,0_30px_60px_-30px_rgba(22,24,29,.45)]",
} as const
