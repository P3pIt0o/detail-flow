import { Plus } from "lucide-react"
import { Container, SectionIntro } from "./primitives"
import { LANDING_FAQ } from "./faq-data"

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <SectionIntro
          titleId="faq-title"
          eyebrow="FAQ"
          title="Questions fréquentes"
          lead={
            <>
              Une autre question ?{" "}
              <a href="mailto:contact@detailflow.fr" className="font-medium text-foreground underline underline-offset-4">
                contact@detailflow.fr
              </a>
            </>
          }
        />
        <div className="divide-y divide-border border-y border-border">
          {LANDING_FAQ.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-lg py-4 text-left text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-2xl pb-5 pr-10 text-pretty text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  )
}
