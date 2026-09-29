import Image from "next/image"
import { Check } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "./screenshot-placeholder"

/** Centralisation professionnelle — dashboard réel + captures manquantes balisées. */
export function ProCockpit() {
  const { cockpit } = marketingV2
  return (
    <section id="fonctionnalites" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div>
              <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{cockpit.title}</h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{cockpit.lead}</p>
              <ul className="mt-8 space-y-3">
                {cockpit.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
              <Image
                src={cockpit.image.src || "/placeholder.svg"}
                alt={cockpit.image.alt}
                width={1600}
                height={1000}
                loading="lazy"
                sizes="(max-width: 1024px) 100vw, 512px"
                className="h-auto w-full"
              />
            </div>
          </Reveal>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {/* TODO-SCREENSHOT: stats/CA */}
          <Reveal>
            <ScreenshotPlaceholder label={cockpit.statsPlaceholder} ratio="16 / 10" />
          </Reveal>
          {/* TODO-SCREENSHOT: booking-mobile */}
          <Reveal delay={0.05}>
            <ScreenshotPlaceholder label={cockpit.mobilePlaceholder} ratio="16 / 10" />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
