import Image from "next/image"
import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"
import { ScreenshotPlaceholder } from "./screenshot-placeholder"

/** Parcours client, de la réservation à l'avis — captures réelles + placeholders balisés. */
export function ClientJourney() {
  const { journey } = marketingV2
  return (
    <section id="parcours" className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{journey.title}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{journey.lead}</p>
          </div>
        </Reveal>

        <ol className="mt-14 space-y-12 lg:space-y-20">
          {journey.steps.map((s, i) => (
            <li key={s.n}>
              <Reveal>
                <div
                  className={`grid items-center gap-8 lg:grid-cols-2 ${
                    i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div>
                    <span className="text-sm font-semibold tracking-widest text-primary">{s.n}</span>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight">{s.title}</h3>
                    <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">{s.description}</p>
                  </div>
                  {s.image ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/5">
                      <Image
                        src={s.image.src || "/placeholder.svg"}
                        alt={s.image.alt}
                        width={1200}
                        height={800}
                        loading="lazy"
                        sizes="(max-width: 1024px) 100vw, 512px"
                        className="h-auto w-full"
                      />
                    </div>
                  ) : (
                    // TODO-SCREENSHOT: client-fiche
                    <ScreenshotPlaceholder label={s.placeholder ?? "Capture produit"} />
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
