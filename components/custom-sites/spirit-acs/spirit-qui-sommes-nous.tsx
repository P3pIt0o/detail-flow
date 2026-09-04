/**
 * Section « Qui sommes-nous ? » de Spirit ACS (composant SERVEUR).
 *
 * Présentation humaine et premium du dirigeant, avec un renforcement du
 * référencement local (Lagny-sur-Marne + prestations). Le contenu affiché est
 * un contenu ÉDITORIAL LOCAL fourni pour la vitrine Spirit ACS (jamais des
 * données Neon, aucune écriture en base). Composant utilisé uniquement par la
 * page d'accueil Spirit → aucun impact sur les autres tenants.
 *
 * Structure sémantique : la section porte l'ancre « À propos » de la navigation
 * et un titre <h2> unique (le seul <h1> de la page reste le hero).
 *
 * Bloc d'identité : initiales « CG » stylisées (aucun faux portrait), nom,
 * fonction, et petits repères confirmés par les données existantes
 * (Lagny-sur-Marne = ville réelle ; Automobile & moto = prestations réelles).
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"

const PARAGRAPHS = [
  "Spirit ACS est dirigé par Corentin Gisclon, passionné par l’entretien esthétique et la mise en valeur des véhicules.",
  "À Lagny-sur-Marne, il accompagne particuliers et professionnels pour leurs besoins en nettoyage automobile, polissage, protection céramique, PPF et detailing moto.",
  "Chaque véhicule est étudié avec attention afin de proposer une prestation adaptée à son état, à son usage et au résultat recherché. L’objectif est de réaliser un travail soigné, d’apporter des conseils clairs et de restituer un véhicule soigneusement mis en valeur.",
] as const

// Repères affichés UNIQUEMENT parce qu'ils sont confirmés par les données
// existantes de Spirit ACS (ville réelle + prestations réelles). Aucune donnée
// non confirmée (année, expérience, certifications, atelier/domicile…).
const MARKERS = ["Lagny-sur-Marne", "Automobile & moto"] as const

export function SpiritQuiSommesNous() {
  return (
    <section
      id={SPIRIT_SECTIONS.apropos}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
          {/* Bloc d'identité (visuel de marque, sans photographie de personne). */}
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[color:var(--spirit-navy)] p-8 text-center text-white shadow-[0_24px_60px_-30px_rgba(6,19,28,0.7)] ring-1 ring-white/10">
              {/* Halo décoratif discret rose/cyan (aria-hidden). */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--spirit-pink)]/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-[var(--spirit-teal)]/25 blur-3xl"
              />

              <div className="relative flex flex-col items-center gap-4">
                {/* Initiales « CG » dans un médaillon dégradé rose → cyan. */}
                <span
                  aria-hidden="true"
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--spirit-pink)] to-[var(--spirit-teal)] text-3xl font-semibold tracking-wide text-white shadow-lg ring-4 ring-white/15"
                >
                  CG
                </span>
                <div>
                  <p className="spirit-title text-xl font-semibold text-white">Corentin Gisclon</p>
                  <p className="mt-1 text-sm text-[color:var(--spirit-teal)]">Dirigeant de Spirit ACS</p>
                </div>

                <ul className="mt-2 flex flex-wrap justify-center gap-2">
                  {MARKERS.map((m) => (
                    <li
                      key={m}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>

          {/* Contenu éditorial + CTA. */}
          <Reveal delay={0.08}>
            <div>
              <span className="spirit-rule" />
              <p className="spirit-eyebrow mt-4">À propos de Spirit ACS</p>
              <h2 className="spirit-title spirit-h2 mt-2 text-balance leading-[1.05]">Qui sommes-nous ?</h2>

              {/* Paragraphes éditoriaux justifiés (spirit-prose) ; l'espacement
                  inter-paragraphes reste géré par space-y-4 (aucun mélange). */}
              <div className="spirit-prose mt-6 space-y-4 text-lg text-[color:var(--spirit-ink)]/75">
                {PARAGRAPHS.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              <div className="mt-8">
                {/* Conserve le tenant courant et positionne sur le formulaire de
                    devis (→ /?tenant=spirit-acs#demande-devis). */}
                <CtaButton href={`/#${SPIRIT_SECTIONS.demandeDevis}`} variant="primary" showArrow>
                  Parler de votre véhicule
                </CtaButton>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
