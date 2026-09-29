import { Plus } from "lucide-react"
import { marketing, marketingV3 } from "@/config/marketing"
import { Reveal } from "@/components/ui/reveal"

/**
 * FAQ v3 — H2 SEO explicite « Questions fréquentes sur DetailFlow ».
 * Accordéon natif <details>/<summary> : accessible, sans JavaScript client.
 * Les questions/réponses alimentent aussi le JSON-LD FAQPage de la page.
 */
export function FaqV3() {
  const { faq } = marketingV3
  return (
    <section id={faq.id} className="scroll-mt-20 border-t border-border/60 bg-card/20">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <h2 className="text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">{faq.h2}</h2>
        </Reveal>
        <div className="mt-10 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
          {marketing.faq.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground transition-colors hover:bg-background/40 sm:text-base">
                {item.q}
                <Plus
                  className="size-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <div className="px-5 pb-5 text-pretty text-sm leading-relaxed text-muted-foreground">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
