import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "./screenshot-placeholder"

/** Page professionnelle créée rapidement (teaser du configurateur /p/<slug> — Lot 2). */
export function PublicPageTeaser() {
  const { publicPage } = marketingV2
  return (
    <section id="page-pro" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* TODO-SCREENSHOT: public-page (page publique d'un tenant démo) */}
          <Reveal>
            <ScreenshotPlaceholder label={publicPage.placeholder} ratio="4 / 3" />
          </Reveal>

          <Reveal delay={0.1}>
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                {publicPage.badge}
              </span>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{publicPage.title}</h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{publicPage.lead}</p>
              <ul className="mt-8 space-y-3">
                {publicPage.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <Link
                href={publicPage.cta.href}
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110"
              >
                {publicPage.cta.label}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
