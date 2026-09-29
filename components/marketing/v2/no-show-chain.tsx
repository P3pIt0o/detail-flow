import { ArrowRight, ArrowDown } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "./screenshot-placeholder"

/** Chaîne anti-no-show : réservation -> acompte -> confirmation -> rappel -> présent. */
export function NoShowChain() {
  const { noShow } = marketingV2
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <Reveal>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{noShow.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{noShow.lead}</p>
        </div>
      </Reveal>

      <div className="mt-12 grid items-center gap-8 lg:grid-cols-2">
        <StaggerGroup className="space-y-3">
          {noShow.steps.map((step, i) => (
            <StaggerItem key={step.label}>
              <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.label}</h3>
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
                {i < noShow.steps.length - 1 && (
                  <ArrowDown className="ml-auto mt-1 size-4 shrink-0 text-primary/60" aria-hidden="true" />
                )}
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        <Reveal delay={0.1}>
          <div>
            {/* TODO-SCREENSHOT: acompte (Stripe Connect côté client) */}
            <ScreenshotPlaceholder label={noShow.acomptePlaceholder} />
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {noShow.footnote}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
