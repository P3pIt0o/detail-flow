"use client"

/**
 * Section « Prestations » de Spirit ACS (maquette : cartes photo avec titre en
 * bas et filet rose).
 *
 * Données 100 % RÉELLES : les prestations proviennent du contrat public
 * (getServices → catalogue visible du tenant, ordre réel, image résolue). On
 * ne recalcule aucun prix : on affiche « À partir de X » si un prix pertinent
 * existe, sinon « Sur devis ». Chaque carte pointe vers la vraie route
 * /reservation?service=<id> en conservant le contexte tenant (`?tenant=`).
 */

import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { withTenant } from "@/lib/tenant-link"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS, type SpiritService } from "./tokens"

function formatPrice(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "Sur devis"
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

type SpiritPrestationsProps = {
  eyebrow: string | null
  title: string
  intro: string | null
  services: SpiritService[]
}

export function SpiritPrestations({ eyebrow, title, intro, services }: SpiritPrestationsProps) {
  const tenant = useSearchParams().get("tenant")
  if (services.length === 0) return null

  return (
    <section
      id={SPIRIT_SECTIONS.prestations}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal>
          <span className="spirit-rule" />
          {eyebrow && <p className="spirit-eyebrow mt-4 !text-[color:var(--spirit-teal-strong)]">{eyebrow}</p>}
          <h2 className="spirit-title mt-2 text-balance text-4xl text-[color:var(--spirit-ink)] sm:text-5xl">
            {title}
          </h2>
          {intro && <p className="mt-4 max-w-2xl text-pretty text-[color:var(--spirit-ink)]/70">{intro}</p>}
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, i) => {
            const price = formatPrice(service.basePriceCents)
            const href = withTenant(`/reservation?service=${service.id}`, tenant)
            return (
              <Reveal key={service.id} delay={Math.min(i, 3) * 0.08}>
                <Link
                  href={href}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-[var(--spirit-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--spirit-pink)] focus-visible:ring-offset-2"
                >
                  <Image
                    src={service.image || "/services/default.png"}
                    alt={service.name}
                    fill
                    loading="lazy"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--spirit-navy)] via-[var(--spirit-navy)]/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className="spirit-rule !w-8" />
                    <h3 className="spirit-title mt-3 text-xl leading-tight text-white">{service.name}</h3>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-[color:var(--spirit-teal)]">
                        {price === "Sur devis" ? price : `Dès ${price}`}
                      </span>
                      <ArrowRight
                        className="size-4 text-white/70 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
