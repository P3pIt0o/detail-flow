/**
 * Section « À propos » de Spirit ACS.
 *
 * Utilise le contenu éditable RÉEL du tenant (content.about, déjà résolu côté
 * serveur avec un repli NEUTRE par le socle — aucun texte marketing inventé
 * ici). Sert de cible à l'ancre « À propos » de la navigation.
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSentences } from "./spirit-sentences"
import { SPIRIT_BTN_GHOST_DARK, SPIRIT_SECTIONS } from "./tokens"

type SpiritAproposProps = {
  title: string
  text: string
  buttonLabel: string | null
  buttonHref: string | null
  /**
   * Présentation locale de repli (paragraphes) affichée UNIQUEMENT quand le
   * tenant n'a pas personnalisé son texte « À propos ». Le texte réel du tenant
   * (`text`) reste PRIORITAIRE. Chaque entrée est un paragraphe distinct.
   */
  fallbackParagraphs?: readonly string[] | null
}

export function SpiritApropos({ title, text, buttonLabel, buttonHref, fallbackParagraphs }: SpiritAproposProps) {
  const useFallback = !text.trim() && Array.isArray(fallbackParagraphs) && fallbackParagraphs.length > 0
  return (
    <section
      id={SPIRIT_SECTIONS.apropos}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8 lg:py-20">
        <Reveal>
          <span className="spirit-rule mx-auto" />
          <h2 className="spirit-title mt-4 text-balance text-3xl sm:text-4xl">{title}</h2>
          {useFallback ? (
            // Présentation locale de repli : paragraphes lisibles (pas un pavé).
            <div className="mt-6 space-y-4 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/75">
              {fallbackParagraphs!.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            // Une phrase par ligne (présentation) : `about.text` n'est jamais réécrit.
            <SpiritSentences
              text={text}
              className="mt-6 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/75"
            />
          )}
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
