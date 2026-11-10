import Link from "next/link"
import { PRICING_COPY } from "@/lib/pricing/plans"
import { INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT, OFFER, UI, getPlan } from "./data"

const planName = "m-0 text-lg font-bold"
const planPrice = "m-0 text-[40px] font-extrabold tracking-[-0.02em]"
const planText = `m-0 text-base leading-[1.55] ${UI.muted}`

function Price({ price, period }: { price: string; period: string }) {
  return (
    <p className={planPrice}>
      {price}
      <span className={`text-[15px] font-medium ${UI.muted}`}> {period}</span>
    </p>
  )
}

/** Accueil v5 : grille courte. Montants, taux et quotas lus dans les sources de vérité. */
export function Pricing() {
  const free = getPlan("starter")
  const pro = getPlan("pro")
  const perf = getPlan("ultime")
  const team = getPlan("entreprise")

  return (
    <section id="tarifs" className="py-20">
      <div className={UI.wrap}>
        <h2 className={UI.h2}>
          Gratuit pour commencer. {OFFER.proFeePercent} de commission dès {pro.price}.
        </h2>
        <p className="m-0 mt-3.5 max-w-[56ch] text-lg leading-[1.55] text-[#4d4a44]">
          Sans engagement, résiliable à tout moment. Prix hors taxes.
        </p>
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-10">
          <div className="flex flex-col gap-2.5 border-t-[3px] border-[#c9c5bb] pt-6">
            <p className={planName}>{free.name}</p>
            {/* La maquette affiche « / mois » ; `free.period` (« sans engagement ») sert ailleurs. */}
            <Price price={free.price} period="/ mois" />
            <p className={planText}>
              Page de réservation, agenda, clients illimités, {OFFER.freeQuotes} devis et {OFFER.freeInvoices} factures
              par mois. Commission de {OFFER.freeFeePercent} sur les paiements en ligne, plafonnée à {OFFER.freeFeeCap}{" "}
              par mois.
            </p>
            {free.cta.href ? (
              <Link className={`${UI.btn} ${UI.secondary} mt-2 self-start`} href={free.cta.href}>
                Créer mon espace
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5 border-t-[3px] border-[#1d5fd0] pt-6">
            <p className={planName}>
              {pro.name} <span className="ml-1.5 text-[13px] font-semibold text-[#1d5fd0]">le plus choisi</span>
            </p>
            <Price price={pro.price} period={pro.period} />
            <p className={planText}>
              Tout illimité, rappels et demandes d&apos;avis automatiques, {OFFER.proSms} SMS par mois, statistiques et
              rentabilité. <strong className="text-[#16181d]">{INDEPENDANT_ZERO_COMMISSION_HIGHLIGHT}.</strong>
            </p>
            {pro.cta.href ? (
              <Link className={`${UI.btn} ${UI.primary} mt-2 self-start`} href={pro.cta.href}>
                {pro.cta.label}
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5 border-t-[3px] border-[#16181d] pt-6">
            <p className={planName}>{perf.name}</p>
            <Price price={perf.price} period={perf.period} />
            <p className={planText}>
              Tout Indépendant, abonnements clients illimités, prospects (CRM), statistiques avancées.{" "}
              {OFFER.businessFeePercent} de commission.
            </p>
            {perf.availability === "coming_soon" || !perf.cta.href ? (
              <span className={`mt-2 text-[15px] font-semibold ${UI.muted}`}>{PRICING_COPY.comingSoonLabel}</span>
            ) : (
              <Link className={`${UI.btn} ${UI.secondary} mt-2 self-start`} href={perf.cta.href}>
                {perf.cta.label}
              </Link>
            )}
          </div>
        </div>
        {team.availability === "coming_soon" ? (
          <p className={`m-0 mt-10 text-[15px] ${UI.muted}`}>
            Plusieurs collaborateurs ? L&apos;offre {team.name} arrive bientôt.
          </p>
        ) : null}
      </div>
    </section>
  )
}
