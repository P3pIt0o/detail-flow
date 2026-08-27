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
      className="relative overflow-hidden bg-[var(--spirit-navy-3)]"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <h2 className="spirit-title text-balance text-4xl text-white sm:text-5xl">{title}</h2>
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
