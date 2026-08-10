/**
 * Section "Présentation / À propos" de la homepage. Contenu personnalisable
 * depuis Paramètres > Site public (titre, texte, bouton facultatif) ; repli
 * neutre si le tenant n'a rien configuré. Voir lib/site-content.ts.
 */

import { SectionHeading } from "@/components/ui/section-heading"
import { CtaButton } from "@/components/ui/cta-button"
import { getPublicSiteContent } from "@/lib/site-content"

export async function AboutSection() {
  const content = await getPublicSiteContent()
  const { title, text, buttonLabel, buttonHref } = content.about

  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading eyebrow="Présentation" title={title} subtitle={text} align="center" />
      {buttonLabel && buttonHref && (
        <div className="mt-8 flex justify-center">
          <CtaButton href={buttonHref} variant="outline" size="lg" showArrow>
            {buttonLabel}
          </CtaButton>
        </div>
      )}
    </section>
  )
}
