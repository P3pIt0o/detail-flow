import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { marketingV2 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"

/** CTA final — self-service « Créer mon espace ». */
export function FinalCtaV2() {
  const { finalCta } = marketingV2
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{finalCta.title}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {finalCta.subtitle}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={finalCta.primaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 sm:w-auto"
            >
              {finalCta.primaryCta.label}
              <ArrowRight className="size-5" aria-hidden="true" />
            </Link>
            <Link
              href={finalCta.secondaryCta.href}
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-card/50 px-8 text-base font-semibold text-foreground transition-colors hover:border-primary/50 sm:w-auto"
            >
              {finalCta.secondaryCta.label}
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">{finalCta.reassurance}</p>
        </Reveal>
      </div>
    </section>
  )
}
