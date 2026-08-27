/**
 * Section « À propos » de Spirit ACS.
 *
 * Utilise le contenu éditable RÉEL du tenant (content.about, déjà résolu côté
 * serveur avec un repli NEUTRE par le socle — aucun texte marketing inventé
 * ici). Sert de cible à l'ancre « À propos » de la navigation.
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_BTN_GHOST_DARK, SPIRIT_SECTIONS } from "./tokens"

type SpiritAproposProps = {
  title: string
  text: string
  buttonLabel: string | null
  buttonHref: string | null
}

export function SpiritApropos({ title, text, buttonLabel, buttonHref }: SpiritAproposProps) {
  return (
    <section
      id={SPIRIT_SECTIONS.apropos}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <span className="spirit-rule mx-auto" />
          <h2 className="spirit-title mt-4 text-balance text-4xl sm:text-5xl">{title}</h2>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/75">{text}</p>
          {buttonLabel && buttonHref && (
            <div className="mt-8 flex justify-center">
              <CtaButton href={buttonHref} variant="outline" className={SPIRIT_BTN_GHOST_DARK}>
                {buttonLabel}
              </CtaButton>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}
