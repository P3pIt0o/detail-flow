import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, ArrowRight, MapPin, FileText, Globe } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { Container, SectionIntro } from "./primitives"

const BADGES = [
  { label: "Site sur mesure", icon: Globe },
  { label: "SEO local", icon: MapPin },
  { label: "Demandes de devis", icon: FileText },
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
          title="Du logiciel au site pensé pour la visibilité."
          lead="Spirit ACS nous a confié la création de son site internet sur mesure."
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <figure className="df-product relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.12_0.012_260)] p-6 shadow-[0_40px_120px_-40px_oklch(0.25_0.08_260/0.55)] sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 [background-image:radial-gradient(ellipse_60%_50%_at_50%_30%,oklch(0.7_0.18_0/0.12),transparent)]"
              />

              <div className="relative mx-auto w-full max-w-[260px]">
                {/* Phone mockup framing the real Spirit ACS site */}
                <div className="relative rounded-[2.25rem] border border-white/10 bg-[oklch(0.08_0.01_260)] p-2 shadow-[0_20px_60px_-20px_oklch(0.1_0.02_260/0.8)] ring-1 ring-inset ring-white/5">
                  <div className="relative overflow-hidden rounded-[1.75rem] bg-black">
                    <div
                      aria-hidden="true"
                      className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-[oklch(0.08_0.01_260)]"
                    />
                    <Image
                      src="/marketing/case-studies/spirit-acs-site.jpg"
                      alt="Site internet sur mesure de Spirit ACS — detailing automobile à Lagny-sur-Marne"
                      width={720}
                      height={1280}
                      className="h-auto w-full max-w-full object-cover"
                      sizes="(max-width: 640px) 60vw, 260px"
                    />
                  </div>
                </div>

                {/* Secondary logo badge */}
                <div className="absolute -bottom-3 -left-3 flex size-16 items-center justify-center rounded-2xl border border-border bg-card p-2 shadow-lg sm:-bottom-4 sm:-left-4 sm:size-20">
                  <Image
                    src="/marketing/case-studies/spirit-detailing.png"
                    alt="Logo Spirit ACS"
                    width={160}
                    height={160}
                    className="h-auto w-full max-w-full object-contain"
                  />
                </div>
              </div>

              <figcaption className="relative mt-6 text-center text-xs font-medium text-muted-foreground">
                spiritacs.com — Detailing automobile à Lagny-sur-Marne
              </figcaption>
            </figure>
          </Reveal>

          <div className="min-w-0">
            <div className="text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              <p>
                Nous avons travaillé sa structure, ses pages prestations et son référencement local pour renforcer sa
                visibilité sur les recherches liées au detailing et au polissage automobile.
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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={SPIRIT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Voir le site Spirit ACS
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </a>
              <Link
                href="/diagnostic"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-sm font-semibold text-foreground transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Obtenir mon diagnostic gratuit
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
