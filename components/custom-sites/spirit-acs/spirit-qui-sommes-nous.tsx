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
 * Bloc d'identité : photographie RÉELLE du dirigeant en prestation (aucun
 * portrait généré), nom, fonction, et petits repères confirmés par les données
 * existantes (Lagny-sur-Marne = ville réelle ; Automobile & moto = prestations
 * réelles).
 */

import Image from "next/image"
import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_SECTIONS } from "./tokens"
import { SPIRIT_ABOUT_FALLBACKS } from "./site-texts"

// Repères affichés UNIQUEMENT parce qu'ils sont confirmés par les données
// existantes de Spirit ACS (ville réelle + prestations réelles). Aucune donnée
// non confirmée (année, expérience, certifications, atelier/domicile…).
const MARKERS = ["Lagny-sur-Marne", "Automobile & moto"] as const

export function SpiritQuiSommesNous({ paragraphs }: { paragraphs?: readonly string[] } = {}) {
  // Texte effectif : override du tenant (3 paragraphes), sinon fallback EXACT.
  const displayParagraphs = paragraphs ?? SPIRIT_ABOUT_FALLBACKS
  return (
    <section
      id={SPIRIT_SECTIONS.apropos}
      data-spirit-anchor
      className="bg-[var(--spirit-paper)] text-[color:var(--spirit-ink)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
          {/* Bloc d'identité : photographie RÉELLE du dirigeant en prestation
              (image native 3:4 affichée sans recadrage), fondue dans une carte
              bleu nuit qui porte son nom, sa fonction et ses repères. */}
          <Reveal>
            <div className="relative overflow-hidden rounded-2xl bg-[color:var(--spirit-navy)] text-white shadow-[0_24px_60px_-30px_rgba(6,19,28,0.7)] ring-1 ring-white/10">
              {/* Halo décoratif discret rose/cyan (aria-hidden). */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--spirit-pink)]/20 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-[var(--spirit-teal)]/25 blur-3xl"
              />

              <div className="relative">
                {/* Photo native 765×1020 (3:4) : object-cover sur un conteneur
                    3:4 = image entière, aucun recadrage du visage ni du geste.
                    Sous la ligne de flottaison → chargement paresseux (défaut). */}
                <div className="relative aspect-[3/4] w-full overflow-hidden">
                  <Image
                    src="/custom-sites/spirit-acs/corentin-gisclon-spirit-acs-detailing-lagny-sur-marne.webp"
                    alt="Corentin Gisclon, dirigeant de Spirit ACS, en pleine prestation de detailing sur une carrosserie à Lagny-sur-Marne"
                    fill
                    sizes="(min-width: 1024px) 22rem, (min-width: 640px) 90vw, 100vw"
                    className="object-cover object-center"
                  />
                  {/* Fondu bas vers le bleu nuit pour une transition fluide vers
                      le bloc nom (décoratif). */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[color:var(--spirit-navy)] to-transparent"
                  />
                </div>

                <div className="px-6 pb-7 pt-4 text-center">
                  <p className="spirit-title text-xl font-semibold text-white">Corentin Gisclon</p>
                  <p className="mt-1 text-sm text-[color:var(--spirit-teal)]">Dirigeant de Spirit ACS</p>

                  <ul className="mt-3 flex flex-wrap justify-center gap-2">
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
                {displayParagraphs.map((p, i) => (
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
