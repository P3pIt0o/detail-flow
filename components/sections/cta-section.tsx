/**
 * Bandeau d'appel à l'action final, réutilisable en bas des pages.
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { Phone } from "lucide-react"
import { getPublicContact } from "@/lib/public-contact"
import { getPublicSiteContent } from "@/lib/site-content"

type CtaSectionProps = {
  title?: string
  description?: string
  buttonLabel?: string
}

/**
 * Bandeau CTA final de la homepage. Sans props explicites, utilise le contenu
 * personnalisable (Paramètres > Site public), avec repli par défaut si vide.
 * Les pages qui passent leurs propres title/description (ex. autres CTA
 * ponctuels) ne sont pas affectées par la personnalisation.
 */
export async function CtaSection({ title, description, buttonLabel }: CtaSectionProps = {}) {
  // Coordonnées réelles du tenant courant (jamais le numéro DetailFlow statique).
  const [contact, content] = await Promise.all([getPublicContact(), getPublicSiteContent()])
  const finalTitle = title ?? content.contact.title
  const finalDescription = description ?? content.contact.text
  const finalButtonLabel = buttonLabel ?? content.contact.buttonLabel
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
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {finalTitle}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              {finalDescription}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaButton href="/reservation" size="lg" showArrow>
                {finalButtonLabel}
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
