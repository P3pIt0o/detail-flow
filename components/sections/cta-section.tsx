/**
 * Bandeau d'appel à l'action final, réutilisable en bas des pages.
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { Phone } from "lucide-react"
import { getPublicContact } from "@/lib/public-contact"

type CtaSectionProps = {
  title?: string
  description?: string
}

export async function CtaSection({
  title = "Prêt à sublimer votre véhicule ?",
  description = "Réservez votre créneau dès aujourd'hui et confiez votre voiture à des experts passionnés.",
}: CtaSectionProps) {
  // Coordonnées réelles du tenant courant (jamais le numéro DetailFlow statique).
  const contact = await getPublicContact()
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center sm:px-12">
          {/* Halo décoratif discret (accent), non intrusif */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">{description}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaButton href="/reservation" size="lg" showArrow>
                Réserver
              </CtaButton>
              {contact.phone && (
                <CtaButton href={`tel:${contact.phoneRaw ?? contact.phone}`} variant="outline" size="lg" external>
                  <Phone className="size-4" aria-hidden="true" />
                  {contact.phone}
                </CtaButton>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
