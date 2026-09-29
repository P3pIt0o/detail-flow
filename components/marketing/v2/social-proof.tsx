import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"
import { BetaPartners } from "@/components/marketing/beta-partners"
import { TrustpilotTrustBox } from "./trustpilot-trustbox"

/**
 * Preuve sociale — partenaires RÉELS ayant consenti (via `BetaPartners`) +
 * emplacement du widget Trustpilot officiel. Aucun avis / chiffre inventé.
 */
export function SocialProof() {
  const { socialProof } = marketingV2
  return (
    <section id="avis" className="scroll-mt-20">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{socialProof.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
              {socialProof.lead}
            </p>
          </div>
        </Reveal>

        {/* Partenaires réels (consent: true) */}
        <Reveal delay={0.05}>
          <div className="mt-12">
            <BetaPartners />
          </div>
        </Reveal>

        {/* Emplacement Trustpilot officiel */}
        <Reveal delay={0.1}>
          <div className="mt-14">
            <h3 className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {socialProof.trustpilotTitle}
            </h3>
            <TrustpilotTrustBox />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
