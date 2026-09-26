import Image from "next/image"
import { ArrowUpRight, MapPin, FileText, Search, Globe } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { Container, SectionIntro } from "./primitives"

const BADGES = [
  { label: "Site sur mesure", icon: Globe },
  { label: "SEO local", icon: MapPin },
  { label: "Demandes de devis", icon: FileText },
  { label: "Référencement local", icon: Search },
] as const

const SPIRIT_URL = "https://www.spiritacs.com"

export function CaseStudy() {
  return (
    <section
      id="cas-client"
      aria-labelledby="cas-client-title"
      className="scroll-mt-24 overflow-hidden border-t border-border py-24 sm:py-32"
    >
      <Container>
        <SectionIntro
          titleId="cas-client-title"
          eyebrow="Cas client"
          title="Du logiciel au site qui génère de la visibilité"
          lead="Spirit ACS nous a confié la création de son site sur mesure."
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <figure className="df-product relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.12_0.012_260)] p-8 shadow-[0_40px_120px_-40px_oklch(0.25_0.08_260/0.55)] sm:p-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 [background-image:radial-gradient(ellipse_60%_50%_at_50%_40%,oklch(0.7_0.18_0/0.12),transparent)]"
              />
              <div className="relative mx-auto flex max-w-[280px] items-center justify-center">
                <Image
                  src="/marketing/case-studies/spirit-detailing.png"
                  alt="Logo Spirit ACS — detailing et polissage automobile"
                  width={560}
                  height={560}
                  className="h-auto w-full max-w-full object-contain"
                />
              </div>
            </figure>
          </Reveal>

          <div className="min-w-0">
            <div className="space-y-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              <p>
                Spirit ACS nous a confié la création de son site internet sur mesure. Nous avons travaillé sa structure,
                ses pages prestations et son référencement local pour renforcer sa visibilité autour du detailing et du
                polissage automobile.
              </p>
              <p>
                Le site est aujourd&apos;hui positionné sur des recherches locales stratégiques liées au detailing
                automobile et au polissage.
              </p>
            </div>

            <ul className="mt-7 flex flex-wrap gap-2" aria-label="Ce que couvre le projet Spirit ACS">
              {BADGES.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>

            <a
              href={SPIRIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Voir le projet
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </Container>
    </section>
  )
}
