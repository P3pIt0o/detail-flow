import type { Metadata } from "next"
import Image from "next/image"
import { about } from "@/config/content"
import { siteConfig } from "@/config/site"
import { PageHeader } from "@/components/layout/page-header"
import { CtaSection } from "@/components/sections/cta-section"
import { Reveal } from "@/components/ui/reveal"

export const metadata: Metadata = {
  title: "À propos",
  description: `Découvrez ${siteConfig.brand.name}, notre passion pour le detailing automobile et nos valeurs : exigence, produits premium et transparence.`,
  alternates: { canonical: "/a-propos" },
}

export default function AProposPage() {
  return (
    <>
      <PageHeader eyebrow="À propos" title={`L'histoire de ${siteConfig.brand.name}`} description={about.intro} />

      {/* Histoire + image */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
              <Image
                src="/about.png"
                alt={`Atelier de detailing ${siteConfig.brand.name}`}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Notre passion, votre véhicule</h2>
              <p className="mt-5 text-pretty leading-relaxed text-muted-foreground">{about.story}</p>

              {/* Statistiques */}
              <dl className="mt-10 grid grid-cols-2 gap-6">
                {about.stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-3xl font-bold text-primary">{stat.value}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Valeurs */}
      <section className="border-y border-border bg-card/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Nos valeurs</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {about.values.map((value, i) => (
              <Reveal key={value.title} delay={i * 0.08}>
                <div className="rounded-2xl border border-border bg-background p-6">
                  <h3 className="text-lg font-semibold text-foreground">{value.title}</h3>
                  <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{value.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaSection />
    </>
  )
}
