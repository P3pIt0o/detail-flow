/**
 * Section « Demander un devis » du site Spirit ACS.
 *
 * Elle EMBARQUE le vrai formulaire public `CustomRequestForm` (relié à la
 * Server Action `submitCustomRequest`) — aucune logique dupliquée, aucune
 * source de données inventée. Le formulaire est simplement RÉ-HABILLÉ aux
 * couleurs Spirit via la classe scopée `.spirit-form-skin` (remap de tokens),
 * sans forker le composant partagé.
 *
 * Ne s'affiche que si le tenant a activé les demandes personnalisées et qu'au
 * moins un type est actif (contrôlé en amont par `quoteEnabled`).
 */

import { CustomRequestForm } from "@/components/custom-request-form"
import type { CustomRequestType } from "@/lib/custom-requests"
import { Reveal } from "@/components/ui/reveal"
import { SpiritSplash } from "./spirit-splash"
import { SPIRIT_SECTIONS } from "./tokens"

type SpiritDemandeDevisProps = {
  title: string | null
  intro: string | null
  types: CustomRequestType[]
}

export function SpiritDemandeDevis({ title, intro, types }: SpiritDemandeDevisProps) {
  return (
    <section
      id={SPIRIT_SECTIONS.demandeDevis}
      data-spirit-anchor
      className="relative overflow-hidden bg-[var(--spirit-navy)] py-16 sm:py-20"
    >
      {/* Projection de lavage décorative (spécifique Spirit) */}
      <SpiritSplash className="pointer-events-none absolute -left-10 top-6 h-40 w-40 opacity-30 sm:h-56 sm:w-56" />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-14 lg:px-8">
        {/* Colonne présentation */}
        <div className="lg:pt-4">
          <Reveal>
            <p className="spirit-eyebrow">Sur mesure</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="spirit-title spirit-h2 mt-3 text-balance leading-tight text-white">
              {title?.trim() || "Demander un devis"}
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-4 max-w-md text-pretty leading-relaxed text-[color:var(--spirit-muted)]">
              {intro?.trim() ||
                "Un besoin particulier, un véhicule d'exception ou une flotte à entretenir ? Décrivez votre projet : nous vous répondons avec une proposition adaptée."}
            </p>
          </Reveal>
        </div>

        {/* Colonne formulaire — vrai composant partagé, ré-habillé (scopé) */}
        <Reveal delay={0.1}>
          <div className="spirit-form-skin rounded-2xl bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] sm:p-8">
            <CustomRequestForm types={types} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
