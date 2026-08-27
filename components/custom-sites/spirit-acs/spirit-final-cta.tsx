/**
 * CTA final de Spirit ACS (maquette : bandeau sombre « Prêt à redonner de
 * l'éclat à votre véhicule ? »).
 *
 * - CTA principal : réservation (route réelle /reservation).
 * - CTA secondaire : demande de devis (route réelle /demande) UNIQUEMENT si la
 *   fonctionnalité « Demandes personnalisées » est activée pour le tenant.
 * - Ligne d'infos : localisation réelle si disponible (aucune donnée inventée).
 *
 * Sert aussi d'ancre `contact`. Le contexte tenant est conservé par CtaButton.
 */

import { MapPin } from "lucide-react"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSplash } from "./spirit-splash"
import { SPIRIT_BTN_PRIMARY, SPIRIT_BTN_GHOST, SPIRIT_SECTIONS } from "./tokens"

type SpiritFinalCtaProps = {
  title: string
  address: string | null
  quoteEnabled: boolean
}

export function SpiritFinalCta({ title, address, quoteEnabled }: SpiritFinalCtaProps) {
  return (
    <section
      id={SPIRIT_SECTIONS.contact}
      data-spirit-anchor
      className="relative overflow-hidden border-t border-white/10 bg-[var(--spirit-navy-3)]"
    >
      {/* Décor « projection de lavage » de part et d'autre (purement décoratif). */}
      <SpiritSplash className="pointer-events-none absolute -left-6 bottom-0 hidden h-44 w-52 sm:block" />
      <SpiritSplash flip className="pointer-events-none absolute -right-6 bottom-0 hidden h-44 w-52 sm:block" />

      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <h2 className="spirit-title text-balance text-3xl text-white sm:text-4xl">{title}</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaButton href="/reservation" size="lg" className={SPIRIT_BTN_PRIMARY}>
              Réserver mon créneau
            </CtaButton>
            {quoteEnabled && (
              <CtaButton href="/demande" variant="outline" size="lg" className={SPIRIT_BTN_GHOST}>
                Demander un devis
              </CtaButton>
            )}
          </div>
        </Reveal>
        {address && (
          <Reveal delay={0.16}>
            <p className="mt-8 flex items-center justify-center gap-2 text-sm text-[color:var(--spirit-muted)]">
              <MapPin className="size-4 text-[var(--spirit-teal)]" aria-hidden="true" />
              {address}
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}
