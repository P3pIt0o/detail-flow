/**
 * Section « Réservez en quelques clics » de Spirit ACS.
 *
 * Reproduit VISUELLEMENT l'intention de la maquette (parcours en 3 étapes) sans
 * coder le faux calendrier : la vraie réservation vit sur la route existante
 * /reservation (BookingWizard). Aucun calendrier ni logique de disponibilité
 * ici. Le CTA conserve le contexte tenant via `CtaButton`.
 */

import { CtaButton } from "@/components/ui/cta-button"
import { Reveal } from "@/components/ui/reveal"
import { SPIRIT_BTN_PRIMARY } from "./tokens"

const STEPS = [
  {
    title: "Choisissez votre prestation",
    text: "Sélectionnez le service adapté à votre véhicule.",
  },
  {
    title: "Sélectionnez votre créneau",
    text: "Choisissez la date et l'heure qui vous conviennent.",
  },
  {
    title: "Recevez votre confirmation",
    text: "Nous vous envoyons tous les détails de votre rendez-vous.",
  },
] as const

export function SpiritReservation() {
  return (
    <section className="bg-[var(--spirit-paper-2)] text-[color:var(--spirit-ink)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <Reveal>
              <span className="spirit-rule" />
              <h2 className="spirit-title mt-4 text-balance text-3xl sm:text-4xl">Réservez en quelques clics</h2>
            </Reveal>

            <ol className="mt-8 space-y-6">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.08}>
                  <li className="flex gap-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--spirit-teal)] text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="spirit-title text-lg">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[color:var(--spirit-ink)]/70">{step.text}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>

          {/* Panneau d'invitation — pas de calendrier factice, redirige vers la
              vraie route de réservation. */}
          <Reveal direction="left">
            <div className="rounded-md border border-[color:var(--spirit-ink)]/10 bg-[var(--spirit-paper)] p-8 sm:p-10">
              <p className="spirit-eyebrow !text-[color:var(--spirit-teal-strong)]">Réservation en ligne</p>
              <p className="mt-3 text-pretty text-lg leading-relaxed text-[color:var(--spirit-ink)]/80">
                Prenez rendez-vous en direct : choisissez votre prestation, votre créneau et confirmez en quelques
                instants.
              </p>
              <div className="mt-8">
                <CtaButton href="/reservation" size="lg" showArrow className={SPIRIT_BTN_PRIMARY}>
                  Réserver mon créneau
                </CtaButton>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
