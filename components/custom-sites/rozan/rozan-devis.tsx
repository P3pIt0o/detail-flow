/**
 * Section « Devis » — accueille le formulaire multi-étapes. En Phase 4, ce
 * formulaire est branché au système existant de demandes (`custom_requests`),
 * scellé au tenant Rozan côté serveur.
 */

import { RozanQuoteForm } from "./rozan-quote-form"
import { ROZAN_SECTIONS } from "./tokens"

export function RozanDevis() {
  return (
    <section id={ROZAN_SECTIONS.devis} className="bg-[var(--rozan-bg)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="text-center">
          <span className="rozan-rule mx-auto" />
          <h2 className="rozan-title rozan-h2 mt-4 text-balance text-[var(--rozan-fg)]">
            Un cas particulier ? Demandez un devis avec photos
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-[var(--rozan-muted)]">
            Vous préférez un devis sur mesure ? Envoyez-nous quelques photos et votre besoin :
            nous revenons vers vous rapidement. Pour réserver et bloquer un créneau tout de suite,
            utilisez plutôt le bouton{" "}
            <span className="font-semibold text-[var(--rozan-accent)]">Réserver</span>.
          </p>
        </div>
        <div className="mt-8">
          <RozanQuoteForm />
        </div>
      </div>
    </section>
  )
}
